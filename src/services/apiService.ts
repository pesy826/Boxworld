import type { ApiConfig, ApiEndpoint } from '../types'
import type { OpenAIMessage } from './promptBuilder'

/**
 * 语音转文字（STT）。POST {baseUrl}/audio/transcriptions（multipart/form-data）。
 * 注意：用 FormData 时不要手动设 Content-Type，让浏览器自动带 boundary。
 */
export async function transcribeAudio(
  endpoint: ApiEndpoint,
  blob: Blob,
  opts?: { model?: string; language?: string; signal?: AbortSignal },
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (!endpoint.apiKey || !endpoint.baseUrl) {
    return { ok: false, error: 'API 配置不完整（STT）' }
  }
  const model = opts?.model || 'whisper-1'
  const url = endpoint.baseUrl.replace(/\/+$/, '') + '/audio/transcriptions'

  const form = new FormData()
  // 文件名后缀影响中转站识别；webm/mp4 都常见，统一给个名字
  const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('mpeg') ? 'mp3' : 'webm'
  form.append('file', blob, `audio.${ext}`)
  form.append('model', model)
  if (opts?.language) form.append('language', opts.language)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${endpoint.apiKey}` },
      body: form,
      signal: opts?.signal,
    })
    if (!res.ok) {
      const t = await res.text()
      return { ok: false, error: `HTTP ${res.status}: ${t.slice(0, 200)}` }
    }
    const data = await res.json()
    const text = String(data?.text ?? '').trim()
    return { ok: true, text }
  } catch (e: any) {
    if (e?.name === 'AbortError') return { ok: false, error: '已取消' }
    return { ok: false, error: e?.message || String(e) }
  }
}

/**
 * 文字转语音（TTS）。POST {baseUrl}/audio/speech，返回音频 Blob。
 */
export async function synthesizeSpeech(
  endpoint: ApiEndpoint,
  text: string,
  opts?: { model?: string; voice?: string; format?: string; signal?: AbortSignal },
): Promise<{ ok: true; blob: Blob } | { ok: false; error: string }> {
  if (!endpoint.apiKey || !endpoint.baseUrl) {
    return { ok: false, error: 'API 配置不完整（TTS）' }
  }
  if (!text.trim()) return { ok: false, error: '合成文本为空' }
  const model = opts?.model || 'tts-1'
  const voice = opts?.voice || 'alloy'
  const format = opts?.format || 'mp3'
  const url = endpoint.baseUrl.replace(/\/+$/, '') + '/audio/speech'

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${endpoint.apiKey}`,
      },
      body: JSON.stringify({ model, input: text, voice, response_format: format }),
      signal: opts?.signal,
    })
    if (!res.ok) {
      const t = await res.text()
      return { ok: false, error: `HTTP ${res.status}: ${t.slice(0, 200)}` }
    }
    const blob = await res.blob()
    if (blob.size === 0) return { ok: false, error: '返回空音频' }
    return { ok: true, blob }
  } catch (e: any) {
    if (e?.name === 'AbortError') return { ok: false, error: '已取消' }
    return { ok: false, error: e?.message || String(e) }
  }
}

/** 测试连接 */
export async function testApiConnection(endpoint: ApiEndpoint): Promise<
  { ok: true; reply: string } | { ok: false; error: string }
> {
  if (!endpoint.apiKey.trim()) return { ok: false, error: 'API Key 为空' }
  if (!endpoint.baseUrl.trim()) return { ok: false, error: 'Base URL 为空' }
  if (!endpoint.model.trim()) return { ok: false, error: '未选择模型' }

  const url = endpoint.baseUrl.replace(/\/+$/, '') + '/chat/completions'

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${endpoint.apiKey}`,
      },
      body: JSON.stringify({
        model: endpoint.model,
        messages: [{ role: 'user', content: '说"连接成功"三个字' }],
        max_tokens: 32,
        temperature: 0,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` }
    }

    const data = await res.json()
    const reply = data?.choices?.[0]?.message?.content ?? '(无内容)'
    return { ok: true, reply: String(reply).slice(0, 100) }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}

/** 获取模型列表 */
export async function fetchModelList(endpoint: Pick<ApiEndpoint, 'baseUrl' | 'apiKey'>): Promise<
  { ok: true; models: string[] } | { ok: false; error: string }
> {
  if (!endpoint.apiKey.trim()) return { ok: false, error: '请先填入 API Key' }
  if (!endpoint.baseUrl.trim()) return { ok: false, error: '请先填入 Base URL' }

  const url = endpoint.baseUrl.replace(/\/+$/, '') + '/models'

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${endpoint.apiKey}` },
    })
    if (!res.ok) {
      const text = await res.text()
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` }
    }
    const data = await res.json()
    const list: any[] = data?.data ?? data?.models ?? []
    const models = list
      .map((m) => (typeof m === 'string' ? m : m.id || m.name))
      .filter(Boolean)
      .sort()
    if (models.length === 0) return { ok: false, error: '返回了空列表' }
    return { ok: true, models }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}

/**
 * 调用 chat completion。
 * @param endpoint 用哪个端点（primary 或 utility）
 * @param config 取生成参数
 * @param messages 消息列表
 */
export async function callChatCompletion(
  endpoint: ApiEndpoint,
  config: Pick<ApiConfig, 'temperature' | 'maxTokens' | 'topP' | 'frequencyPenalty' | 'presencePenalty' | 'seed'>,
  messages: OpenAIMessage[],
  options?: {
    signal?: AbortSignal
    maxTokensOverride?: number
    temperatureOverride?: number
    /** 调试用途标签 */
    debugPurpose?: import('../stores/promptDebugStore').PromptPurpose
    /** 调试用：当前角色名 */
    debugCharacterName?: string
    /** 调试用：端点名（'primary' / 'utility'） */
    debugEndpointName?: string
  },
): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  if (!endpoint.apiKey || !endpoint.baseUrl || !endpoint.model) {
    return { ok: false, error: 'API 配置不完整' }
  }

  const url = endpoint.baseUrl.replace(/\/+$/, '') + '/chat/completions'
  const body: Record<string, unknown> = {
    model: endpoint.model,
    messages,
    temperature: options?.temperatureOverride ?? config.temperature,
    max_tokens: options?.maxTokensOverride ?? config.maxTokens,
    top_p: config.topP,
    frequency_penalty: config.frequencyPenalty,
    presence_penalty: config.presencePenalty,
    stream: false,
  }
  if (config.seed >= 0) body.seed = config.seed

  // 记录到调试面板
  const debugStore = (await import('../stores/promptDebugStore')).usePromptDebugStore.getState()
  const debugId = options?.debugPurpose
    ? debugStore.add({
      purpose: options.debugPurpose,
      characterName: options.debugCharacterName,
      endpoint: options.debugEndpointName || 'primary',
      model: endpoint.model,
      messages,
    })
    : null

  const startedAt = Date.now()

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${endpoint.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: options?.signal,
    })
    if (!res.ok) {
      const text = await res.text()
      const errMsg = `HTTP ${res.status}: ${text.slice(0, 300)}`
      if (debugId) debugStore.updateError(debugId, errMsg, Date.now() - startedAt)
      return { ok: false, error: errMsg }
    }
    const data = await res.json()
    const content = String(data?.choices?.[0]?.message?.content ?? '')
    if (debugId) debugStore.updateReply(debugId, content, Date.now() - startedAt)
    return { ok: true, content }
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      if (debugId) debugStore.updateError(debugId, '已取消', Date.now() - startedAt)
      return { ok: false, error: '已取消' }
    }
    const errMsg = e?.message || String(e)
    if (debugId) debugStore.updateError(debugId, errMsg, Date.now() - startedAt)
    return { ok: false, error: errMsg }
  }
}


/** AI 改写微信开场白 */
export async function rewriteAsImGreeting(
  endpoint: ApiEndpoint,
  characterName: string,
  originalFirstMes: string,
  systemPromptTemplate: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (!endpoint.apiKey || !endpoint.baseUrl || !endpoint.model) {
    return { ok: false, error: '请先配置好 API' }
  }
  if (!originalFirstMes.trim()) return { ok: false, error: '原始开场白为空' }

  const url = endpoint.baseUrl.replace(/\/+$/, '') + '/chat/completions'

  // 把角色名注入到 system prompt 末尾
  const systemPrompt = `${systemPromptTemplate}\n\n角色名：${characterName}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${endpoint.apiKey}`,
      },
      body: JSON.stringify({
        model: endpoint.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: originalFirstMes },
        ],
        temperature: 0.7,
        max_tokens: 512,
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` }
    }
    const data = await res.json()
    const reply = String(data?.choices?.[0]?.message?.content ?? '').trim()
    if (!reply) return { ok: false, error: '模型返回为空' }
    return { ok: true, text: reply }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}
/**
 * 流式 chat completion。
 * 每收到一段增量文本就回调 onDelta，结束时返回完整内容。
 * 中转不支持流式时会失败，调用方应回退到非流式。
 */
export async function callChatCompletionStream(
  endpoint: ApiEndpoint,
  config: Pick<ApiConfig, 'temperature' | 'maxTokens' | 'topP' | 'frequencyPenalty' | 'presencePenalty' | 'seed'>,
  messages: OpenAIMessage[],
  onDelta: (delta: string, accumulated: string) => void,
  options?: {
    signal?: AbortSignal
    debugPurpose?: import('../stores/promptDebugStore').PromptPurpose
    debugCharacterName?: string
    debugEndpointName?: string
  },
): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  if (!endpoint.apiKey || !endpoint.baseUrl || !endpoint.model) {
    return { ok: false, error: 'API 配置不完整' }
  }

  const url = endpoint.baseUrl.replace(/\/+$/, '') + '/chat/completions'
  const body: Record<string, unknown> = {
    model: endpoint.model,
    messages,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    top_p: config.topP,
    frequency_penalty: config.frequencyPenalty,
    presence_penalty: config.presencePenalty,
    stream: true,
  }
  if (config.seed >= 0) body.seed = config.seed

  // 调试记录
  const debugStore = (await import('../stores/promptDebugStore')).usePromptDebugStore.getState()
  const debugId = options?.debugPurpose
    ? debugStore.add({
        purpose: options.debugPurpose,
        characterName: options.debugCharacterName,
        endpoint: options.debugEndpointName || 'primary',
        model: endpoint.model,
        messages,
      })
    : null

  const startedAt = Date.now()

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${endpoint.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: options?.signal,
    })

    if (!res.ok) {
      const text = await res.text()
      const errMsg = `HTTP ${res.status}: ${text.slice(0, 300)}`
      if (debugId) debugStore.updateError(debugId, errMsg, Date.now() - startedAt)
      return { ok: false, error: errMsg }
    }

    if (!res.body) {
      const errMsg = '响应没有 body（不支持流式？）'
      if (debugId) debugStore.updateError(debugId, errMsg, Date.now() - startedAt)
      return { ok: false, error: errMsg }
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let accumulated = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // 按行解析 SSE：data: {...}
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''  // 最后一段可能不完整，留到下次

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') continue
        try {
          const json = JSON.parse(data)
          const delta = json?.choices?.[0]?.delta?.content
          if (typeof delta === 'string' && delta) {
            accumulated += delta
            onDelta(delta, accumulated)
          }
        } catch {
          // 单行解析失败忽略（可能是不完整的 chunk）
        }
      }
    }

    if (debugId) debugStore.updateReply(debugId, accumulated, Date.now() - startedAt)
    return { ok: true, content: accumulated }
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      if (debugId) debugStore.updateError(debugId, '已取消', Date.now() - startedAt)
      return { ok: false, error: '已取消' }
    }
    const errMsg = e?.message || String(e)
    if (debugId) debugStore.updateError(debugId, errMsg, Date.now() - startedAt)
    return { ok: false, error: errMsg }
  }
}
