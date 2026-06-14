import { db } from '../db'
import type { LorebookEntry, Message } from '../types'

export interface ActivatedEntries {
  before: LorebookEntry[]                       // before_char 区
  after: LorebookEntry[]                        // after_char 区
  atDepth: Map<number, LorebookEntry[]>         // depth -> entries
}

/**
 * 根据当前对话上下文，决定哪些世界书条目要被激活注入。
 *
 * 触发规则（简化版）：
 * - constant=true 的条目：永远激活
 * - 否则：在最近 N 条消息（这里取 10 条）的文本里搜关键词，命中即激活
 *
 * @param lorebookId 角色绑定的世界书 id
 * @param recentMessages 最近的对话消息（用于关键词扫描），按时间正序
 * @param userInput 当前用户正在发的输入（也参与扫描）
 */
export async function activateLorebookEntries(
  lorebookId: string | undefined,
  recentMessages: Message[],
  userInput: string,
): Promise<ActivatedEntries> {
  const result: ActivatedEntries = {
    before: [],
    after: [],
    atDepth: new Map(),
  }

  if (!lorebookId) return result

  const allEntries = await db.lorebookEntries
    .where('lorebookId').equals(lorebookId)
    .toArray()

  const enabled = allEntries.filter((e) => e.enabled)

  // 拼接最近文本用于关键词扫描（取最后 10 条 + 当前输入）
  const scanTexts: string[] = []
  for (const m of recentMessages.slice(-10)) {
    if (m.type === 'text' || m.type === 'sticker') {
      scanTexts.push(m.content)
    }
  }
  if (userInput) scanTexts.push(userInput)

  const activated: LorebookEntry[] = []
  for (const entry of enabled) {
    if (entry.constant) {
      activated.push(entry)
      continue
    }
    if (entry.keys.length === 0) continue
    if (matchesAnyKey(scanTexts, entry.keys, entry.caseSensitive)) {
      activated.push(entry)
    }
  }

  // 按 insertionOrder 排序（小的在前）
  activated.sort((a, b) => a.insertionOrder - b.insertionOrder)

  // 分桶
  for (const e of activated) {
    if (e.position === 'before_char') result.before.push(e)
    else if (e.position === 'after_char') result.after.push(e)
    else {
      const list = result.atDepth.get(e.depth) || []
      list.push(e)
      result.atDepth.set(e.depth, list)
    }
  }

  return result
}

function matchesAnyKey(texts: string[], keys: string[], caseSensitive: boolean): boolean {
  for (const key of keys) {
    const k = caseSensitive ? key : key.toLowerCase()
    for (const t of texts) {
      const text = caseSensitive ? t : t.toLowerCase()
      if (text.includes(k)) return true
    }
  }
  return false
}
