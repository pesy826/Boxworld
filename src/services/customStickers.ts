import type { Character } from '../types'
import { useCharacterStore } from '../stores/characterStore'

/**
 * 角色专属常用表情工具。
 *
 * 命名约定：每张专属表情的"表情名"= `自定义·<情绪槽>·<序号>`（序号从 1 起），
 * 例如「自定义·开心·2」。这样不会和通用表情库的名字冲突，AI 也能稳定引用。
 *
 * 使用策略：
 * - prompt 注入时按情绪槽分组列出专属表情名，并引导"约 6 成概率用专属表情"。
 * - "随意"槽 = 不限情绪场景的百搭表情，任何时候都可点缀。
 * - 分发 sticker 消息时，把命中的专属表情名解析回 base64 存进消息 imageData，渲染零查找。
 */

const PREFIX = '自定义'
const SEP = '·'

/** 构造某张专属表情的稳定表情名 */
export function makeCustomStickerName(slot: string, index: number): string {
  return `${PREFIX}${SEP}${slot}${SEP}${index + 1}`
}

/** 判断一个表情名是否是专属表情命名 */
export function isCustomStickerName(name: string): boolean {
  return name.trim().startsWith(`${PREFIX}${SEP}`)
}

/**
 * 把某角色的某个专属表情名解析回 base64 图片。查不到返回 undefined。
 * 解析时容错：去掉首尾空白；序号越界/槽位不存在则返回 undefined。
 */
export function resolveCustomSticker(character: Character | undefined, name: string): string | undefined {
  if (!character?.customStickers) return undefined
  const parts = name.trim().split(SEP)
  // 期望 [前缀, 槽位, 序号]
  if (parts.length < 3 || parts[0] !== PREFIX) return undefined
  const idxStr = parts[parts.length - 1]
  const slot = parts.slice(1, parts.length - 1).join(SEP)
  const idx = parseInt(idxStr, 10) - 1
  const arr = character.customStickers[slot]
  if (!arr || idx < 0 || idx >= arr.length) return undefined
  return arr[idx]
}

/** 按角色 id 解析专属表情（供群聊/渲染按 senderId 取） */
export function resolveCustomStickerById(characterId: string | undefined, name: string): string | undefined {
  if (!characterId) return undefined
  const char = useCharacterStore.getState().getById(characterId)
  return resolveCustomSticker(char, name)
}

/** 该角色是否配置了任何专属表情 */
export function hasCustomStickers(character: Character | undefined): boolean {
  if (!character?.customStickers) return false
  return Object.values(character.customStickers).some((arr) => arr && arr.length > 0)
}

/**
 * 生成「角色专属常用表情」的 prompt 文本片段。无专属表情则返回空串。
 * 措辞要点：主动行为引导 + 6/4 占比 + "随意"槽说明。
 */
export function buildCustomStickerText(character: Character | undefined): string {
  if (!hasCustomStickers(character)) return ''
  const cs = character!.customStickers!
  const lines: string[] = []
  for (const [slot, arr] of Object.entries(cs)) {
    if (!arr || arr.length === 0) continue
    const names = arr.map((_, i) => makeCustomStickerName(slot, i)).join('、')
    if (slot === '随意') {
      lines.push(`· 【随意（任何场景都可点缀）】${names}`)
    } else {
      lines.push(`· 【${slot}】${names}`)
    }
  }
  if (lines.length === 0) return ''
  return `【你的专属常用表情】下面是你自己平时爱用的表情，按情绪分了类。当你想发表情时，**优先（大约 6 成的概率）从这里挑符合当下情绪的专属表情**，剩下约 4 成才用下面的通用表情库。"随意"类的表情不限场景，任何情绪都能拿来点缀。content 必须完整复制下面的表情名（含「${PREFIX}${SEP}」前缀），禁止编造：
${lines.join('\n')}`
}