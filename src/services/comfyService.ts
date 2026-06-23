/**
 * ComfyUI 文生图服务（仅桌面端使用）。
 *
 * 流程：组装 workflow（API 格式）→ POST /prompt → 轮询 /history/{id} → GET /view 取图 → 压缩成 dataURL。
 * 不依赖 websocket，纯 HTTP 轮询，兼容性最好。
 */
import { useSettingsStore } from '../stores/settingsStore'
import { createDefaultComfyConfig } from '../db/defaults'
import { isDesktop, isTauri } from '../utils/platform'
import { callChatCompletion } from './apiService'
import { getActiveUtilityPrompt } from './utilityPrompts'
import type { ComfyConfig } from '../types'

/**
 * 统一 fetch：Tauri 桌面端走 @tauri-apps/plugin-http（Rust 侧发请求，无 CORS 限制，
 * ComfyUI 无需加 --enable-cors-header 参数）；浏览器开发环境回退原生 fetch。
 *
 * 注意：超时用 AbortController + setTimeout 手动实现，不用 AbortSignal.timeout()——
 * Tauri HTTP 插件对 timeout signal 兼容性差，会导致请求直接失败。
 */
async function comfyFetch(url: string, init?: RequestInit, timeoutMs?: number): Promise<Response> {
  const controller = new AbortController()
  const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null
  try {
    if (isTauri()) {
      const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http')
      // ComfyUI 新版校验 Origin/Referer：tauri://localhost 这类跨站会被 403 拒绝。
      // 伪装成 ComfyUI 自身的同源请求。
      const headers = { ...(init?.headers as Record<string, string> | undefined) }
      try {
        const u = new URL(url)
        headers['Origin'] = u.origin
        headers['Referer'] = u.origin + '/'
        headers['Host'] = u.host
      } catch { /* ignore */ }
      return await tauriFetch(url, { ...init, headers, signal: controller.signal })
    }
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export interface ComfyGenResult {
  ok: boolean
  /** 成功时为压缩后的 dataURL */
  image?: string
  error?: string
}

/** 当前 ComfyUI 是否可用（桌面端 + 已启用 + 已填地址） */
export function isComfyAvailable(): boolean {
  if (!isDesktop()) return false
  const cfg = getComfyConfig()
  return !!(cfg.enabled && cfg.baseUrl.trim())
}

export function getComfyConfig(): ComfyConfig {
  const s = useSettingsStore.getState().settings
  return s?.comfyConfig || createDefaultComfyConfig()
}

/**
 * 用辅助模型把"中文画面描述"改写成规范的英文文生图提示词。
 * 仅在 comfyConfig.promptGenEnabled 开启时调用；prompt 模板取 image_prompt_gen utility 预设（用户可编辑）。
 * 失败/未配置时返回原始描述（出图链路仍可继续，只是用原文）。
 */
export async function generateImagePrompt(chineseDesc: string): Promise<string> {
  const cfg = getComfyConfig()
  if (!cfg.promptGenEnabled) return chineseDesc
  return runImagePromptRewrite(chineseDesc)
}

/**
 * 实际的提示词改写逻辑（不判断任何后端的开关）。
 * 供 comfy / nai 两个后端共用——开关判断在各自调用方做。
 */
export async function runImagePromptRewrite(chineseDesc: string): Promise<string> {
  const settings = useSettingsStore.getState().settings
  if (!settings) return chineseDesc
  // 优先辅助模型，没配回退主模型
  const endpoint = useSettingsStore.getState().getUtilityEndpoint() || settings.apiConfig.primary
  if (!endpoint?.apiKey || !endpoint?.baseUrl || !endpoint?.model) return chineseDesc

  const template = getActiveUtilityPrompt('image_prompt_gen')
  if (!template) return chineseDesc

  try {
    const result = await callChatCompletion(
      endpoint,
      settings.apiConfig,
      [
        { role: 'system', content: template },
        { role: 'user', content: chineseDesc },
      ],
      {
        maxTokensOverride: 400,
        temperatureOverride: 0.5,
        debugPurpose: 'moment_summary',
        debugEndpointName: 'utility',
      },
    )
    if (result.ok && result.content.trim()) {
      // 去掉可能的 markdown 围栏 / 多余引号
      return result.content.trim().replace(/^```[a-z]*\n?|\n?```$/gi, '').trim()
    }
  } catch {
    // 忽略，回退原文
  }
  return chineseDesc
}

function baseUrl(cfg: ComfyConfig): string {
  let u = cfg.baseUrl.trim().replace(/\/+$/, '')
  // 用户可能只填 127.0.0.1:8188 不带协议，必须补全 http://，
  // 否则 Tauri 会把它当相对路径拼到 tauri.localhost 上（报错 tauri.localhost/127.0.0.1:8188）。
  if (u && !/^https?:\/\//i.test(u)) u = `http://${u}`
  return u
}

/** 测试连接：GET /system_stats */
export async function testComfyConnection(cfg?: ComfyConfig): Promise<{ ok: boolean; info?: string; error?: string }> {
  const c = cfg || getComfyConfig()
  try {
    const res = await comfyFetch(`${baseUrl(c)}/system_stats`, undefined, 8000)
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const data = await res.json()
    const dev = data?.devices?.[0]
    const info = dev ? `${dev.name || '未知设备'}` : 'ComfyUI 已连接'
    return { ok: true, info }
  } catch (e: any) {
    const detail = e?.message || String(e)
    const hint = isTauri() ? '' : '（浏览器预览需 ComfyUI 启动时加 --enable-cors-header）'
    return { ok: false, error: `无法连接：${detail}${hint}` }
  }
}

/** 拉取可用 checkpoint 模型列表 */
export async function fetchComfyCheckpoints(cfg?: ComfyConfig): Promise<{ ok: boolean; models: string[]; error?: string }> {
  const c = cfg || getComfyConfig()
  try {
    const res = await comfyFetch(`${baseUrl(c)}/object_info/CheckpointLoaderSimple`, undefined, 8000)
    if (!res.ok) return { ok: false, models: [], error: `HTTP ${res.status}` }
    const data = await res.json()
    const models: string[] = data?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || []
    return { ok: true, models }
  } catch (e: any) {
    return { ok: false, models: [], error: e?.message || '拉取失败' }
  }
}

/**
 * 拉取 UNet 模式所需的各类模型列表（UNet / CLIP / VAE + dtype/clipType 枚举）。
 * 一次请求 object_info 全量解析，避免多次往返。
 */
export async function fetchComfyUnetModels(cfg?: ComfyConfig): Promise<{
  ok: boolean
  unet: string[]
  clip: string[]
  vae: string[]
  weightDtypes: string[]
  clipTypes: string[]
  error?: string
}> {
  const c = cfg || getComfyConfig()
  const empty = { unet: [], clip: [], vae: [], weightDtypes: [], clipTypes: [] }
  try {
    const res = await comfyFetch(`${baseUrl(c)}/object_info`, undefined, 12000)
    if (!res.ok) return { ok: false, ...empty, error: `HTTP ${res.status}` }
    const data = await res.json()
    const req = (node: string) => data?.[node]?.input?.required || {}
    const unet = (req('UNETLoader')?.unet_name?.[0]) || []
    const weightDtypes = (req('UNETLoader')?.weight_dtype?.[0]) || ['default', 'fp8_e4m3fn', 'fp8_e5m2']
    const dualClip = req('DualCLIPLoader')
    const singleClip = req('CLIPLoader')
    const clip = (singleClip?.clip_name?.[0]) || (dualClip?.clip_name1?.[0]) || []
    // 合并单/双 CLIP 加载器支持的类型（单 CLIP 的 stable_diffusion 等也要能选）
    const typeSet = new Set<string>([
      ...((singleClip?.type?.[0]) || []),
      ...((dualClip?.type?.[0]) || []),
    ])
    const clipTypes = typeSet.size > 0 ? [...typeSet] : ['stable_diffusion', 'sdxl', 'sd3', 'flux']
    const vae = (req('VAELoader')?.vae_name?.[0]) || []
    return { ok: true, unet, clip, vae, weightDtypes, clipTypes }
  } catch (e: any) {
    return { ok: false, ...empty, error: e?.message || '拉取失败' }
  }
}

/**
 * 拉取 KSampler 支持的采样器 / 调度器枚举（供设置页下拉选择）。
 */
export async function fetchComfySamplers(cfg?: ComfyConfig): Promise<{
  ok: boolean
  samplers: string[]
  schedulers: string[]
  error?: string
}> {
  const c = cfg || getComfyConfig()
  try {
    const res = await comfyFetch(`${baseUrl(c)}/object_info/KSampler`, undefined, 8000)
    if (!res.ok) return { ok: false, samplers: [], schedulers: [], error: `HTTP ${res.status}` }
    const data = await res.json()
    const req = data?.KSampler?.input?.required || {}
    const samplers: string[] = req?.sampler_name?.[0] || []
    const schedulers: string[] = req?.scheduler?.[0] || []
    return { ok: true, samplers, schedulers }
  } catch (e: any) {
    return { ok: false, samplers: [], schedulers: [], error: e?.message || '拉取失败' }
  }
}

/**
 * 内置 txt2img 工作流（API 格式）。
 * 按 modelMode 选用：
 * - checkpoint：CheckpointLoaderSimple 单文件（model/clip/vae 都来自它）
 * - unet：UNETLoader + DualCLIPLoader + VAELoader 分离式（Flux/SD3 等常用）
 */
function buildDefaultWorkflow(cfg: ComfyConfig, prompt: string, seed: number): Record<string, any> {
  const ksampler = (modelRef: any, posRef: any, negRef: any, latentRef: any) => ({
    class_type: 'KSampler',
    inputs: {
      seed,
      steps: cfg.steps,
      cfg: cfg.cfg,
      sampler_name: cfg.samplerName,
      scheduler: cfg.scheduler,
      denoise: 1,
      model: modelRef,
      positive: posRef,
      negative: negRef,
      latent_image: latentRef,
    },
  })

  if (cfg.modelMode === 'unet') {
    // 分离式：UNet + CLIP + VAE
    // 只有一个 CLIP（clipName2 留空）→ 用单 CLIPLoader；否则用 DualCLIPLoader
    const clipNode = cfg.clipName2?.trim()
      ? {
        class_type: 'DualCLIPLoader',
        inputs: {
          clip_name1: cfg.clipName1 || '',
          clip_name2: cfg.clipName2,
          type: cfg.clipType || 'sdxl',
        },
      }
      : {
        class_type: 'CLIPLoader',
        inputs: {
          clip_name: cfg.clipName1 || '',
          type: cfg.clipType || 'stable_diffusion',
        },
      }
    return {
      '1': { class_type: 'UNETLoader', inputs: { unet_name: cfg.unetName || '', weight_dtype: cfg.unetWeightDtype || 'default' } },
      '2': clipNode,
      '3': { class_type: 'VAELoader', inputs: { vae_name: cfg.vaeName || '' } },
      '4': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['2', 0] } },
      '5': { class_type: 'CLIPTextEncode', inputs: { text: cfg.negativePrompt, clip: ['2', 0] } },
      '6': { class_type: 'EmptyLatentImage', inputs: { width: cfg.width, height: cfg.height, batch_size: 1 } },
      '7': ksampler(['1', 0], ['4', 0], ['5', 0], ['6', 0]),
      '8': { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['3', 0] } },
      '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'boxworld', images: ['8', 0] } },
    }
  }

  // checkpoint 单文件
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: cfg.checkpoint } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['1', 1] } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: cfg.negativePrompt, clip: ['1', 1] } },
    '4': { class_type: 'EmptyLatentImage', inputs: { width: cfg.width, height: cfg.height, batch_size: 1 } },
    '5': ksampler(['1', 0], ['2', 0], ['3', 0], ['4', 0]),
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': { class_type: 'SaveImage', inputs: { filename_prefix: 'boxworld', images: ['6', 0] } },
  }
}

/** 自定义工作流：替换占位符 %prompt% %negative% %seed% */
function buildCustomWorkflow(cfg: ComfyConfig, prompt: string, seed: number): Record<string, any> | null {
  try {
    const jsonEscaped = (s: string) => JSON.stringify(s).slice(1, -1)
    const text = cfg.customWorkflow
      .replace(/%prompt%/g, jsonEscaped(prompt))
      .replace(/%negative%/g, jsonEscaped(cfg.negativePrompt))
      .replace(/%seed%/g, String(seed))
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * 文生图主入口。
 * @param prompt AI 生成的英文提示词（会自动拼接 positivePrefix）
 */
export async function generateComfyImage(prompt: string): Promise<ComfyGenResult> {
  const cfg = getComfyConfig()
  if (!isDesktop()) return { ok: false, error: '仅桌面端支持 ComfyUI' }
  if (!cfg.enabled) return { ok: false, error: 'ComfyUI 未启用' }
  if (!cfg.baseUrl.trim()) return { ok: false, error: '未配置 ComfyUI 地址' }

  // 拼接画风前缀 + AI 提示词 + 质量后缀
  const fullPrompt = [cfg.positivePrefix.trim(), prompt.trim(), (cfg.positiveSuffix || '').trim()]
    .filter(Boolean)
    .join(', ')
  const seed = Math.floor(Math.random() * 2 ** 32)

  let workflow: Record<string, any> | null
  if (cfg.customWorkflow.trim()) {
    workflow = buildCustomWorkflow(cfg, fullPrompt, seed)
    if (!workflow) return { ok: false, error: '自定义工作流 JSON 解析失败' }
  } else {
    if (cfg.modelMode === 'unet') {
      if (!cfg.unetName) return { ok: false, error: '未选择 UNet 模型' }
      if (!cfg.clipName1) return { ok: false, error: '未选择 CLIP 模型' }
      if (!cfg.vaeName) return { ok: false, error: '未选择 VAE 模型' }
    } else if (!cfg.checkpoint) {
      return { ok: false, error: '未选择 Checkpoint 模型' }
    }
    workflow = buildDefaultWorkflow(cfg, fullPrompt, seed)
  }

  const url = baseUrl(cfg)
  try {
    // 1. 提交任务
    const submitRes = await comfyFetch(`${url}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: 'boxworld' }),
    }, 15000)
    if (!submitRes.ok) {
      const errText = await submitRes.text().catch(() => '')
      return { ok: false, error: `提交失败 HTTP ${submitRes.status}: ${errText.slice(0, 200)}` }
    }
    const submitData = await submitRes.json()
    const promptId: string = submitData?.prompt_id
    if (!promptId) return { ok: false, error: '未返回 prompt_id' }

    // 2. 轮询历史直到完成
    const deadline = Date.now() + (cfg.timeoutSec || 180) * 1000
    let outputs: any = null
    while (Date.now() < deadline) {
      await sleep(1500)
      const histRes = await comfyFetch(`${url}/history/${promptId}`, undefined, 8000)
      if (!histRes.ok) continue
      const hist = await histRes.json()
      const entry = hist?.[promptId]
      if (entry?.status?.status_str === 'error') {
        return { ok: false, error: 'ComfyUI 执行出错（请检查工作流/模型）' }
      }
      if (entry?.outputs && Object.keys(entry.outputs).length > 0) {
        outputs = entry.outputs
        break
      }
    }
    if (!outputs) return { ok: false, error: `出图超时（>${cfg.timeoutSec}s）` }

    // 3. 找到输出图片
    let imageInfo: { filename: string; subfolder: string; type: string } | null = null
    for (const nodeId of Object.keys(outputs)) {
      const imgs = outputs[nodeId]?.images
      if (Array.isArray(imgs) && imgs.length > 0) {
        imageInfo = imgs[0]
        break
      }
    }
    if (!imageInfo) return { ok: false, error: '输出中没有图片' }

    // 4. 拉取图片并压缩为 dataURL
    const params = new URLSearchParams({
      filename: imageInfo.filename,
      subfolder: imageInfo.subfolder || '',
      type: imageInfo.type || 'output',
    })
    const imgRes = await comfyFetch(`${url}/view?${params}`, undefined, 30000)
    if (!imgRes.ok) return { ok: false, error: `取图失败 HTTP ${imgRes.status}` }
    const blob = await imgRes.blob()
    const dataUrl = await blobToCompressedDataUrl(blob, 1024, 0.85)
    return { ok: true, image: dataUrl }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'ComfyUI 请求失败' }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Blob → 压缩 JPEG dataURL（与朋友圈用户传图一致：1024px / 0.85） */
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