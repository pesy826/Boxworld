import { extractPngTextChunks, pngToDataUrl } from '../utils/png'
import { uuid } from '../utils/id'
import { db } from '../db'
import { useLorebookStore } from '../stores/lorebookStore'
import { decodeHtmlEntities } from '../utils/text'
import type { Character, Lorebook, LorebookEntry } from '../types'

/** 把任意值转字符串并解码 HTML 实体（角色卡里常混 &quot; 等未解码实体） */
function txt(v: unknown): string {
  return decodeHtmlEntities(String(v ?? ''))
}

export async function parseCharacterCardFromPng(file: File): Promise<Character> {
  const buffer = await file.arrayBuffer()
  const chunks = extractPngTextChunks(buffer)
  let payload: any = null
  let foundKeyword = ''

  for (const kw of ['ccv3', 'chara']) {
    const chunk = chunks.find((c) => c.keyword === kw)
    if (chunk) {
      try {
        payload = JSON.parse(decodeBase64Utf8(chunk.text))
        foundKeyword = kw
        break
      } catch (e) {
        console.warn(`[boxworld] 解析 ${kw} 失败`, e)
      }
    }
  }

  if (!payload) throw new Error('PNG 中未找到角色卡数据（不是酒馆格式的卡片？）')

  const data = payload.data || payload
  const avatar = pngToDataUrl(buffer)
  return await normalizeToCharacter(data, avatar, foundKeyword)
}

export async function parseCharacterCardFromJson(file: File): Promise<Character> {
  const text = await file.text()
  const payload = JSON.parse(text)
  const data = payload.data || payload
  return await normalizeToCharacter(data, undefined, 'json')
}

async function normalizeToCharacter(
  data: any,
  avatar: string | undefined,
  source: string,
): Promise<Character> {
  const now = Date.now()

  // 1. 解析世界书（如果有）
  let lorebookId: string | undefined
  const bookData = data.character_book
  if (bookData && Array.isArray(bookData.entries) && bookData.entries.length > 0) {
    lorebookId = await importLorebook(bookData, String(data.name || '角色'))
  }

  const character: Character = {
    id: uuid(),
    name: txt(data.name || '未命名角色').slice(0, 100),
    avatar,
    description: txt(data.description),
    personality: txt(data.personality),
    scenario: txt(data.scenario),
    firstMes: txt(data.first_mes),
    mesExample: txt(data.mes_example),
    systemPrompt: data.system_prompt ? txt(data.system_prompt) : undefined,
    postHistoryInstructions: data.post_history_instructions
      ? txt(data.post_history_instructions) : undefined,
    alternateGreetings: Array.isArray(data.alternate_greetings)
      ? data.alternate_greetings.map(txt) : [],
    creatorNotes: data.creator_notes ? txt(data.creator_notes) : undefined,
    tags: Array.isArray(data.tags) ? data.tags.map(txt) : [],
    imFirstMes: undefined,
    activeLevel: 5,
    lorebookId,
    muted: false,          // 新增
    lastTickAt: 0,         // 新增
    soloModeEntered: false,    // 新增
    soloVirtualTime: 0,        // 新增
    soloRealAnchor: 0,         // 新增
    isNpc: false,            // 新增：导入的卡都是主卡
    privateMemory: '',       // 新增：私有世界记忆初始为空
    createdAt: now,
    updatedAt: now,
  }

  console.log(`[boxworld] 解析角色卡成功（来源：${source}）:`, character.name,
    lorebookId ? `（含世界书，${bookData.entries.length} 条）` : '')
  return character
}

/**
 * 导入酒馆 character_book 字段为一本世界书。
 * 返回新建的 lorebookId。
 */
async function importLorebook(book: any, charName: string): Promise<string> {
  const now = Date.now()
  const lorebook: Lorebook = {
    id: uuid(),
    name: String(book.name || `${charName} 的世界书`),
    description: book.description ? String(book.description) : undefined,
    createdAt: now,
    updatedAt: now,
  }
  await db.lorebooks.add(lorebook)

  const entries: LorebookEntry[] = (book.entries as any[]).map((e: any, i: number) => {
    // 酒馆 position 字段是数字：0=before_char, 1=after_char, 2/3/4...=at_depth
    // 但 V2 规范里实际上 position 用字符串。两种都兼容下。
    let position: LorebookEntry['position'] = 'before_char'
    let depth = 0
    const rawPos = e.position
    if (typeof rawPos === 'string') {
      if (rawPos === 'after_char' || rawPos === 'before_char') position = rawPos
      else if (rawPos === 'at_depth') position = 'at_depth'
    } else if (typeof rawPos === 'number') {
      if (rawPos === 0) position = 'before_char'
      else if (rawPos === 1) position = 'after_char'
      else { position = 'at_depth'; depth = Math.max(0, rawPos - 2) }
    }

    return {
      id: uuid(),
      lorebookId: lorebook.id,
      name: String(e.name || e.comment || `条目 ${i + 1}`),
      keys: Array.isArray(e.keys) ? e.keys.map(String) : [],
      content: String(e.content || ''),
      enabled: e.enabled !== false,
      constant: !!e.constant,
      position,
      role: 'system',  // 酒馆默认 system，简化处理
      depth,
      insertionOrder: typeof e.insertion_order === 'number' ? e.insertion_order : i,
      caseSensitive: !!e.case_sensitive,
    }
  })

  await db.lorebookEntries.bulkAdd(entries)
  await useLorebookStore.getState().load()
  return lorebook.id
}

function decodeBase64Utf8(b64: string): string {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder('utf-8').decode(bytes)
}
