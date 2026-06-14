import { useSettingsStore } from '../stores/settingsStore'
import { useMomentStore } from '../stores/momentStore'
import { getActiveUtilityPrompt } from './utilityPrompts'
import { usePromptDebugStore } from '../stores/promptDebugStore'
import type { Moment, ApiEndpoint, ApiConfig } from '../types'

interface DescribeResult {
  ok: boolean
  descriptions?: string[]
  error?: string
}

const FALLBACK_PROMPT = `请用简短的中文描述这张图片的内容。
要求：
- 一句话概括，30-80 字
- 抓住主体、场景、氛围
- 不要主观评价
- 直接输出描述，不要前缀`

/**
 * 给一条 moment 的所有图片生成描述。
 * 失败时返回 { ok: false }，调用方决定是否标记 imageAnalyzed=true 来避免重试。
 */
export async function describeMomentImages(moment: Moment): Promise<DescribeResult> {
  if (!moment.images || moment.images.length === 0) {
    return { ok: true, descriptions: [] }
  }

  const settings = useSettingsStore.getState().settings
  if (!settings) return { ok: false, error: '设置未加载' }

  const promptTemplate = getActiveUtilityPrompt('image_describe') || FALLBACK_PROMPT

  // 优先用辅助 endpoint
  const utility = useSettingsStore.getState().getUtilityEndpoint()
  const primary = settings.apiConfig.primary

  const endpoints: Array<{ endpoint: ApiEndpoint; name: string }> = []
  if (utility) endpoints.push({ endpoint: utility, name: 'utility' })
  if (primary && (!utility || primary.apiKey !== utility.apiKey || primary.model !== utility.model)) {
    endpoints.push({ endpoint: primary, name: 'primary' })
  }

  if (endpoints.length === 0) {
    return { ok: false, error: '无可用 API 端点' }
  }

  const descriptions: string[] = []
  for (let i = 0; i < moment.images.length; i++) {
    const dataUrl = moment.images[i]
    let desc = ''
    let lastError = ''

    for (const { endpoint, name } of endpoints) {
      const r = await describeOneImage(endpoint, settings.apiConfig, promptTemplate, dataUrl, name)
      if (r.ok) {
        desc = r.text
        break
      }
      lastError = r.error
    }

    if (desc) {
      descriptions.push(desc)
    } else {
      // 单张图失败：填占位、继续处理下一张
      descriptions.push(`[图片：解析失败（${lastError.slice(0, 40)}）]`)
    }
  }

  return { ok: true, descriptions }
}

/** 单张图调用 vision API */
async function describeOneImage(
  endpoint: ApiEndpoint,
  config: ApiConfig,
  promptTemplate: string,
  dataUrl: string,
  endpointName: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (!endpoint.apiKey || !endpoint.baseUrl || !endpoint.model) {
    return { ok: false, error: '配置不完整' }
  }

  const url = endpoint.baseUrl.replace(/\/+$/, '') + '/chat/completions'

  // OpenAI 兼容的 vision 消息格式
  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: promptTemplate },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    },
  ]

  // 调试记录
  const debugStore = usePromptDebugStore.getState()
  const debugId = debugStore.add({
    purpose: 'moment_summary',  // 复用现有类型，这里也可以加 'image_describe' 类型到 PromptPurpose
    endpoint: endpointName,
    model: endpoint.model,
    messages: [{ role: 'user', content: '[图片描述请求]\n' + promptTemplate }] as any,
  })

  const startedAt = Date.now()

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${endpoint.apiKey}`,
      },
      body: JSON.stringify({
        model: endpoint.model,
        messages,
        max_tokens: 200,
        temperature: 0.3,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      const errMsg = `HTTP ${res.status}: ${text.slice(0, 200)}`
      debugStore.updateError(debugId, errMsg, Date.now() - startedAt)
      return { ok: false, error: errMsg }
    }

    const data = await res.json()
    const content = String(data?.choices?.[0]?.message?.content ?? '').trim()
    if (!content) {
      debugStore.updateError(debugId, '返回为空', Date.now() - startedAt)
      return { ok: false, error: '返回为空' }
    }
    debugStore.updateReply(debugId, content, Date.now() - startedAt)
    return { ok: true, text: content }
  } catch (e: any) {
    const errMsg = e?.message || String(e)
    debugStore.updateError(debugId, errMsg, Date.now() - startedAt)
    return { ok: false, error: errMsg }
  }
}

/**
 * 给所有用户朋友圈中"有图但未分析"的批量补分析。
 * 失败的也会标记 imageAnalyzed=true，避免重复尝试。
 */
export async function analyzeUnprocessedUserMoments(): Promise<{ processed: number }> {
  const moments = useMomentStore.getState().moments
  const todo = moments.filter(
    (m) => m.authorId === 'user' && m.images.length > 0 && !m.imageAnalyzed,
  )

  if (todo.length === 0) return { processed: 0 }

  let processed = 0
  for (const m of todo) {
    const r = await describeMomentImages(m)
    if (r.ok && r.descriptions) {
      await useMomentStore.getState().setMomentImageDescriptions(m.id, r.descriptions, true)
      processed++
    } else {
      // 失败也标记，避免反复尝试；下次发新图才会再触发
      const placeholders = m.images.map(() => '[图片：解析失败]')
      await useMomentStore.getState().setMomentImageDescriptions(m.id, placeholders, true)
    }
  }
  return { processed }
}
