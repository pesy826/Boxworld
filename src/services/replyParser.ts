/**
 * 微信模式下，模型回复期望是 JSON 格式：
 * {
 *   "messages": [{ "type": "text", "content": "..." }],
 *   "mood": "...",
 *   "scene_hint": null | "..."
 * }
 *
 * 但模型不一定每次都老实输出 JSON，要做容错。
 */

export interface ParsedReply {
  messages: Array<{
    type: 'text' | 'sticker' | 'image'
    content: string
    /** type=image 时的英文文生图提示词 */
    imagePrompt?: string
  }>
  mood?: string
  sceneHint?: string | null
}

/**
 * 尝试从模型回复中解析出 ParsedReply。
 * 兜底策略（按优先级）：
 *   1. 解析 ```json ... ``` 围栏
 *   2. 找第一个 { 到对应的 } 解析
 *   3. 整段当一条普通 text 消息
 */
export function parseReply(raw: string): ParsedReply {
  const cleaned = raw.trim()
  if (!cleaned) return { messages: [] }

  // 1. 尝试提取 ```json ... ``` 围栏
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch) {
    const parsed = tryParseJson(fenceMatch[1])
    if (parsed) return parsed
  }

  // 2. 尝试找 { ... }
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const parsed = tryParseJson(cleaned.slice(firstBrace, lastBrace + 1))
    if (parsed) return parsed
  }

  // 3. 兜底：整段当一条消息
  return {
    messages: [{ type: 'text', content: cleaned }],
  }
}

function tryParseJson(text: string): ParsedReply | null {
  try {
    const obj = JSON.parse(text)
    if (!obj || typeof obj !== 'object') return null

    const rawMessages = Array.isArray(obj.messages) ? obj.messages : []
    const messages: ParsedReply['messages'] = []
    for (const m of rawMessages) {
      if (!m || typeof m !== 'object') continue
      const type = m.type === 'sticker' ? 'sticker' : m.type === 'image' ? 'image' : 'text'
      const content = String(m.content ?? '').trim()
      const imagePrompt = typeof m.image_prompt === 'string' ? m.image_prompt.trim() : undefined
      if (type === 'image') {
        // 图片消息必须有提示词；content 是中文描述（可缺省）
        if (imagePrompt) messages.push({ type, content: content || '图片', imagePrompt })
        else if (content) messages.push({ type: 'text', content })
      } else if (content) {
        messages.push({ type, content })
      }
    }

    return {
      messages,
      mood: typeof obj.mood === 'string' ? obj.mood : undefined,
      sceneHint: typeof obj.scene_hint === 'string'
        ? obj.scene_hint
        : (obj.scene_hint === null ? null : undefined),
    }
  } catch {
    return null
  }
}
