/**
 * NovelAI 文生图服务（与 ComfyUI 平级的另一个出图后端，不限平台）。
 *
 * 流程：组装请求体 → POST /ai/generate-image → 返回 zip（内含 PNG）→ 解 zip 取 PNG → 压成 dataURL。
 * 跨域：桌面端走 @tauri-apps/plugin-http（无 CORS 限制）；浏览器/移动端用原生 fetch（需中转站支持跨域）。
 *
 * zip 解析：内置最小实现（支持 store 无压缩 + deflate），避免引入 jszip 依赖。
 */
import { useSettingsStore } from '../stores/settingsStore'
import { createDefaultNaiConfig } from '../db/defaults'
import { isTauri } from '../utils/platform'
import type { NaiConfig } from '../types'

export interface NaiGenResult {
  ok: boolean
  /** 成功时为压缩后的 dataURL */
  image?: string
  error?: string
}

export function getNaiConfig(): NaiConfig {
  const s = useSettingsStore.getState().settings
  return s?.naiConfig || createDefaultNaiConfig()
}

/** 当前 NAI 是否可用（已启用 + 已填 key） */
export function isNaiAvailable(): boolean {
  const cfg = getNaiConfig()
  return !!(cfg.enabled && cfg.apiKey.trim())
}

function baseUrl(cfg: NaiConfig): string {
  let u = (cfg.baseUrl || 'https://image.novelai.net').trim().replace(/\/+$/, '')
  if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`
  return u
}

/** 统一 fetch：桌面端走 Tauri http 插件，其余走原生 fetch；超时用 AbortController 手动实现 */
async function naiFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    if (isTauri()) {
      const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http')
      return await tauriFetch(url, { ...init, signal: controller.signal })
    }
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 文生图主入口。
 * @param prompt AI 生成的英文提示词（会拼接 positivePrefix / positiveSuffix）
 */
export async function generateNaiImage(prompt: string): Promise<NaiGenResult> {
  const cfg = getNaiConfig()
  if (!cfg.enabled) return { ok: false, error: 'NAI 未启用' }
  if (!cfg.apiKey.trim()) return { ok: false, error: '未配置 NAI API Key' }

  const fullPrompt = [cfg.positivePrefix.trim(), prompt.trim(), (cfg.positiveSuffix || '').trim()]
    .filter(Boolean)
    .join(', ')

  const body = {
    input: fullPrompt,
    model: cfg.model || 'nai-diffusion-4-5-full',
    action: 'generate',
    parameters: {
      width: cfg.width,
      height: cfg.height,
      scale: cfg.scale,
      sampler: cfg.sampler || 'k_euler_ancestral',
      steps: cfg.steps,
      n_samples: 1,
      seed: Math.floor(Math.random() * 2 ** 32),
      negative_prompt: cfg.negativePrompt || '',
      ucPreset: 0,
      qualityToggle: true,
    },
  }

  try {
    const res = await naiFetch(`${baseUrl(cfg)}/ai/generate-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey.trim()}`,
        Accept: 'application/x-zip-compressed, */*',
      },
      body: JSON.stringify(body),
    }, (cfg.timeoutSec || 120) * 1000)

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return { ok: false, error: `HTTP ${res.status}: ${errText.slice(0, 200)}` }
    }

    const zipBuf = await res.arrayBuffer()
    const png = await extractFirstPngFromZip(new Uint8Array(zipBuf))
    if (!png) return { ok: false, error: '响应 zip 中未找到图片' }

    const blob = new Blob([png as BlobPart], { type: 'image/png' })
    const dataUrl = await blobToCompressedDataUrl(blob, 1024, 0.85)
    return { ok: true, image: dataUrl }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'NAI 请求失败' }
  }
}

/** 测试出图（设置页用） */
export async function testNaiGenerate(): Promise<NaiGenResult> {
  return generateNaiImage('a cute orange cat sitting on a windowsill, sunny day, cozy room, soft light')
}

// ============ 最小 ZIP 解析（store + deflate） ============

/**
 * 从 zip 字节流中提取第一个 PNG。
 * 解析 Local File Header（签名 PK\x03\x04）；compression 0=store 直接取，8=deflate 用 DecompressionStream。
 */
async function extractFirstPngFromZip(buf: Uint8Array): Promise<Uint8Array | null> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let offset = 0
  while (offset + 30 <= buf.length) {
    const sig = dv.getUint32(offset, true)
    if (sig !== 0x04034b50) break // 不是 Local File Header，结束
    const compression = dv.getUint16(offset + 8, true)
    const compSize = dv.getUint32(offset + 18, true)
    const nameLen = dv.getUint16(offset + 26, true)
    const extraLen = dv.getUint16(offset + 28, true)
    const dataStart = offset + 30 + nameLen + extraLen
    const compData = buf.subarray(dataStart, dataStart + compSize)

    let fileData: Uint8Array
    if (compression === 0) {
      fileData = compData
    } else if (compression === 8) {
      fileData = await inflateRaw(compData)
    } else {
      // 不支持的压缩方式，跳到下一个条目
      offset = dataStart + compSize
      continue
    }

    // 校验 PNG 魔数
    if (fileData.length > 8 && fileData[0] === 0x89 && fileData[1] === 0x50) {
      return fileData
    }
    offset = dataStart + compSize
  }
  return null
}

/** deflate-raw 解压（浏览器原生 DecompressionStream） */
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('当前环境不支持解压 deflate zip')
  }
  const ds = new DecompressionStream('deflate-raw')
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds)
  const ab = await new Response(stream).arrayBuffer()
  return new Uint8Array(ab)
}

/** Blob → 压缩 JPEG dataURL（与 comfyService 一致：1024px / 0.85） */
async function blobToCompressedDataUrl(blob: Blob, maxSize: number, quality: number): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(objectUrl); resolve(image) }
    image.onerror = (e) => { URL.revokeObjectURL(objectUrl); reject(e) }
    image.src = objectUrl
  })

  let { width, height } = img
  if (width > maxSize || height > maxSize) {
    if (width >= height) {
      height = Math.round((height / width) * maxSize)
      width = maxSize
    } else {
      width = Math.round((width / height) * maxSize)
      height = maxSize
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 不可用')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', quality)
}