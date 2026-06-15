import type {
  Character, Message, Preset, PromptSlot, UserPersona,
  LorebookEntry, ApiConfig,
} from '../types'
import { applyMacros, type MacroContext } from './macros'
import { activateLorebookEntries, type ActivatedEntries } from './lorebookActivator'
import { useSceneSummaryStore } from '../stores/sceneSummaryStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useCharacterStore } from '../stores/characterStore'
import { useStickerStore } from '../stores/assetStore'
import { isComfyAvailable } from './comfyService'
import {
  buildUserMomentsText, buildCharacterMomentsText, buildMomentInteractionsText,
} from './momentContext'

/** 多模态内容片段（OpenAI vision 格式） */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant'
  /** 纯文本用 string；含图片时用片段数组（vision 多模态） */
  content: string | ContentPart[]
}

export interface BuildPromptArgs {
  preset: Preset
  character: Character
  userPersona: UserPersona
  virtualNow: number
  history: Message[]
  userInput?: string
  apiConfig: ApiConfig
  chatId?: string
}

export async function buildPrompt(args: BuildPromptArgs): Promise<OpenAIMessage[]> {
  const { preset, character, userPersona, virtualNow, history, userInput, apiConfig, chatId } = args

  // 主模型是否支持识图（vision）。关闭时聊天里的图片降级成文字，避免不支持的模型报 400
  const visionEnabled = !!apiConfig.primary.vision

  const macroCtx: MacroContext = { character, userPersona, virtualNow }
  const filteredHistory = filterHistoryByMode(history, preset.mode)
  const activated = await activateLorebookEntries(character.lorebookId, filteredHistory, userInput || '')
  const sceneSummary = chatId ? useSceneSummaryStore.getState().get(chatId)?.content : undefined

  // 预先取好朋友圈文本（异步）
  const tickConfig = useSettingsStore.getState().settings?.tickConfig
  const momentsCtx = {
    userMoments: '',
    characterMoments: '',
    momentInteractions: '',
  }
  if (preset.slots.some((s) => s.enabled && s.role === 'user_moments')) {
    momentsCtx.userMoments = await buildUserMomentsText(character.id, {
      summaryEnabled: tickConfig?.momentSummaryEnabled ?? false,
      summaryThreshold: tickConfig?.momentSummaryThreshold ?? 30,
      recentWhenSummarized: 5,
      maxRecent: 20,
    })
  }

  if (preset.slots.some((s) => s.enabled && s.role === 'character_moments')) {
    momentsCtx.characterMoments = await buildCharacterMomentsText(character.id, 10)
  }
  if (preset.slots.some((s) => s.enabled && s.role === 'moment_interactions')) {
    momentsCtx.momentInteractions = await buildMomentInteractionsText(character.id)
  }

  const reservedForOther = estimateOtherSlotsTokens(preset, character, activated, macroCtx, sceneSummary, momentsCtx)
  const historyBudget = Math.max(1000, apiConfig.contextSize - reservedForOther - apiConfig.maxTokens)
  const trimmedHistory = trimHistoryByBudget(filteredHistory, historyBudget)

  const messages: OpenAIMessage[] = []
  for (const slot of preset.slots) {
    if (!slot.enabled) continue
    const built = buildSlot(slot, {
      character, userPersona, macroCtx, activated,
      history: trimmedHistory, sceneSummary, momentsCtx, visionEnabled,
    })
    if (built) messages.push(...built)
  }

  // IM 模式自动注入可用表情列表（有表情库才注入）
  if (preset.mode === 'im') {
    const stickerText = buildStickerListText()
    if (stickerText) {
      messages.push({ role: 'system', content: stickerText })
    }
    // ComfyUI 可用时注入"发图片"能力说明（仅桌面端 + 已启用）
    const imageHint = buildChatImageHint()
    if (imageHint) {
      messages.push({ role: 'system', content: imageHint })
    }
  }

  return mergeAdjacent(messages)
}

/**
 * 可用表情列表文本（只注入描述，token 极小）；超过上限随机抽样。
 * 内置素材包可能有几百个表情，注入太多浪费 token 且降低模型选择质量，
 * 默认抽样 100 个（每次调用随机，长期看角色能用到全库的表情）。
 *
 * 措辞要点（曾因被动说明导致 AI 从不发表情）：
 * - 主动行为引导：明确"何时该发"（情绪场景触发条件），而非被动"怎么发"
 * - 用"像真人"贴合角色扮演动机
 * - 保留"别滥发"约束，防止矫枉过正
 */
export function buildStickerListText(maxCount = 100): string {
  const stickers = useStickerStore.getState().stickers
  if (stickers.length === 0) return ''
  // 用户收藏/上传的表情优先全量进列表（让角色能"偷"用户的表情包），剩余名额再从库里随机补
  const favorites = stickers.filter((s) => s.favorite)
  const others = stickers.filter((s) => !s.favorite)
  const remaining = Math.max(0, maxCount - favorites.length)
  const sampledOthers = others.length > remaining
    ? [...others].sort(() => Math.random() - 0.5).slice(0, remaining)
    : others
  const pool = [...favorites, ...sampledOthers]
  const names = pool.map((s) => s.desc).join('、')
  return `【表情包】你会像真人一样在微信聊天中发表情包活跃气氛。开心、大笑、无语、调侃、敷衍、害羞、生气、震惊等情绪明显的时刻，或者想斗图逗对方时，就单独发一条表情消息（type:"sticker"，content 写表情名）。聊得起劲时大胆用，但别每条都发。
可用表情（content 必须从中选一个，完整复制名字、可含连字符，禁止编造）：
${names}`
}

/**
 * ComfyUI 可用时，IM 聊天注入"发图片"能力说明。
 * 同表情包的经验：主动行为引导（何时发）+ 别滥发约束。
 */
export function buildChatImageHint(): string {
  if (!isComfyAvailable()) return ''
  return `【发图片】你可以像真人一样在微信里发照片：分享美食、风景、自拍、宠物、正在做的事、看到的有趣东西时，发一张图片消息让聊天更生动。聊到"我给你看""拍给你"或对方让你发照片时，更应该发。
发图片消息的格式（messages 数组里的一项）：
{"type": "image", "content": "图片的中文一句话描述（20-40字）", "image_prompt": "英文文生图提示词，Stable Diffusion 风格逗号分隔标签，描述画面内容/构图/光线，不要出现人名"}
注意：一次最多发 1 张图；不是每次回复都要发图，自然聊天为主。`
}

function filterHistoryByMode(history: Message[], mode: Preset['mode']): Message[] {
  if (mode === 'im') {
    return history.filter((m) => m.type === 'text' || m.type === 'sticker' || m.type === 'image')
  }
  if (mode === 'scene') {
    return history.filter((m) =>
      m.type === 'text' || m.type === 'sticker' || m.type === 'scene_narrative',
    )
  }
  return history
}

interface MomentsCtx {
  userMoments: string
  characterMoments: string
  momentInteractions: string
}

interface SlotBuildCtx {
  character: Character
  userPersona: UserPersona
  macroCtx: MacroContext
  activated: ActivatedEntries
  history: Message[]
  sceneSummary?: string
  momentsCtx: MomentsCtx
  /** 主模型是否支持识图：true=图片以 image_url 多模态喂入；false=降级为文字 */
  visionEnabled: boolean
}

/** 取该角色生效的用户人设：自己的 userProfile → NPC 回退所属世界主卡的 → 全局昵称 */
function resolveUserProfile(character: Character, userPersona: UserPersona): string {
  if (character.userProfile?.trim()) return character.userProfile.trim()
  if (character.isNpc && character.parentWorldId) {
    const mainChar = useCharacterStore.getState().getById(character.parentWorldId)
    if (mainChar?.userProfile?.trim()) return mainChar.userProfile.trim()
  }
  return userPersona.name || ''
}

/**
 * NPC 的人设描述追加所属世界主卡的背景档案。
 * 注意：NPC 不一定认识主卡（可能只是用户的同事等），所以措辞必须中性——
 * 是否认识、了解多少，由 NPC 自己的人设/关系决定，避免模型瞎编主卡信息。
 */
function resolveDescription(character: Character): string {
  if (!character.isNpc || !character.parentWorldId) return character.description
  const mainChar = useCharacterStore.getState().getById(character.parentWorldId)
  if (!mainChar) return character.description
  const mainBrief = [
    `【世界背景资料：本世界主要角色「${mainChar.name}」的档案】`,
    `（注意：你是否认识 ${mainChar.name}、对 TA 了解多少，完全以你自己的人设和关系设定为准。若你的人设表明你们认识，以下信息可作为你对 TA 的了解；若你的人设和 TA 没有交集，则你并不认识 TA，不应表现出知道这些信息）`,
    mainChar.description?.trim() ? truncateText(mainChar.description, 3000) : '',
    mainChar.personality?.trim() ? `性格：${truncateText(mainChar.personality, 800)}` : '',
  ].filter(Boolean).join('\n')
  return `${character.description}\n\n${mainBrief}`
}

function truncateText(text: string, max: number): string {
  const t = text.trim()
  return t.length > max ? t.slice(0, max) + '…' : t
}

function buildSlot(slot: PromptSlot, ctx: SlotBuildCtx): OpenAIMessage[] | null {
  const { character, userPersona, macroCtx, activated, history, sceneSummary, momentsCtx, visionEnabled } = ctx

  switch (slot.role) {
    case 'static':
    case 'jailbreak': {
      const text = applyMacros(slot.content, macroCtx).trim()
      return text ? [{ role: slot.messageRole, content: text }] : null
    }
    case 'char_description': return wrapField(slot, resolveDescription(character), macroCtx)
    case 'char_personality': return wrapField(slot, character.personality, macroCtx)
    case 'char_scenario': return wrapField(slot, character.scenario, macroCtx)
    case 'char_mes_example': return wrapField(slot, character.mesExample, macroCtx)
    case 'char_system_prompt': return wrapField(slot, character.systemPrompt || '', macroCtx)
    case 'char_post_history': return wrapField(slot, character.postHistoryInstructions || '', macroCtx)
    case 'user_persona': return wrapField(slot, resolveUserProfile(character, userPersona), macroCtx)
    case 'lorebook_before': return renderLorebookEntries(activated.before, macroCtx)
    case 'lorebook_after': return renderLorebookEntries(activated.after, macroCtx)
    case 'history': return renderHistory(history, activated, macroCtx, visionEnabled)
    case 'scene_summary': return wrapField(slot, sceneSummary || '', macroCtx)
    case 'user_moments': return wrapField(slot, momentsCtx.userMoments, macroCtx)
    case 'character_moments': return wrapField(slot, momentsCtx.characterMoments, macroCtx)
    case 'moment_interactions': return wrapField(slot, momentsCtx.momentInteractions, macroCtx)
    case 'private_memory': return wrapField(slot, character.privateMemory || '', macroCtx)
  }
}

function wrapField(slot: PromptSlot, raw: string, macroCtx: MacroContext): OpenAIMessage[] | null {
  if (!raw || !raw.trim()) return null
  const renderedRaw = applyMacros(raw, macroCtx)
  let text: string
  if (slot.content && slot.content.trim()) {
    // slot.content 作为标题前缀（其中的宏会被替换），再拼接真实内容
    const title = applyMacros(slot.content, macroCtx)
    text = `${title.trim()}\n${renderedRaw}`
  } else {
    text = renderedRaw
  }
  return [{ role: slot.messageRole, content: text.trim() }]
}


function renderLorebookEntries(entries: LorebookEntry[], macroCtx: MacroContext): OpenAIMessage[] | null {
  if (entries.length === 0) return null
  const messages: OpenAIMessage[] = []
  for (const e of entries) {
    const text = applyMacros(e.content, macroCtx).trim()
    if (!text) continue
    messages.push({ role: e.role, content: text })
  }
  return messages.length > 0 ? messages : null
}

function renderHistory(history: Message[], activated: ActivatedEntries, macroCtx: MacroContext, visionEnabled: boolean): OpenAIMessage[] {
  const result: OpenAIMessage[] = []
  for (let i = 0; i < history.length; i++) {
    const msg = history[i]
    if (msg.role === 'system') continue

    const depthFromEnd = history.length - 1 - i
    const depthEntries = activated.atDepth.get(depthFromEnd)
    if (depthEntries && depthEntries.length > 0) {
      for (const e of depthEntries) {
        const text = applyMacros(e.content, macroCtx).trim()
        if (text) result.push({ role: e.role, content: text })
      }
    }

    const role = msg.role === 'assistant' ? 'assistant' : 'user'

    // 图片消息带 imageData：
    // - 主模型支持识图（visionEnabled）→ 以 OpenAI image_url 多模态直喂
    // - 不支持 → 降级为文字 [图片：描述]（走下面 renderMessageContent），避免模型报 400
    if (msg.type === 'image' && msg.imageData && visionEnabled) {
      const label = '（我发了一张图片）'
      const text = msg.content ? `${label}${msg.content}` : label
      result.push({
        role,
        content: [
          { type: 'text', text },
          { type: 'image_url', image_url: { url: msg.imageData } },
        ],
      })
      continue
    }

    const content = renderMessageContent(msg)
    if (content) {
      result.push({ role, content })
    }
  }
  return result
}

function renderMessageContent(msg: Message): string {
  switch (msg.type) {
    case 'text': return msg.content
    case 'sticker': return `[表情：${msg.content}]`
    case 'image': return msg.content ? `[图片：${msg.content}]` : '[图片]'
    case 'voice': return `[语音：${msg.content}]`
    case 'system_notice': return ''
    case 'scene_narrative': return msg.content
    default: return msg.content
  }
}

function estimateOtherSlotsTokens(
  preset: Preset, char: Character, activated: ActivatedEntries,
  macroCtx: MacroContext, sceneSummary: string | undefined, momentsCtx: MomentsCtx,
): number {
  let total = 0
  for (const slot of preset.slots) {
    if (!slot.enabled || slot.role === 'history') continue
    let text = ''
    switch (slot.role) {
      case 'static':
      case 'jailbreak': text = applyMacros(slot.content, macroCtx); break
      case 'char_description': text = resolveDescription(char); break
      case 'char_personality': text = char.personality; break
      case 'char_scenario': text = char.scenario; break
      case 'char_mes_example': text = char.mesExample; break
      case 'char_system_prompt': text = char.systemPrompt || ''; break
      case 'char_post_history': text = char.postHistoryInstructions || ''; break
      case 'user_persona': text = resolveUserProfile(char, macroCtx.userPersona); break
      case 'lorebook_before': text = activated.before.map((e) => e.content).join('\n'); break
      case 'lorebook_after': text = activated.after.map((e) => e.content).join('\n'); break
      case 'scene_summary': text = sceneSummary || ''; break
      case 'user_moments': text = momentsCtx.userMoments; break
      case 'character_moments': text = momentsCtx.characterMoments; break
      case 'moment_interactions': text = momentsCtx.momentInteractions; break
      case 'private_memory': text = char.privateMemory || ''; break
    }
    total += estimateTokens(text)
  }
  for (const list of activated.atDepth.values()) {
    total += list.reduce((s, e) => s + estimateTokens(e.content), 0)
  }
  return total
}

function trimHistoryByBudget(history: Message[], budget: number): Message[] {
  const result: Message[] = []
  let used = 0
  for (let i = history.length - 1; i >= 0; i--) {
    const t = estimateTokens(renderMessageContent(history[i]))
    if (used + t > budget && result.length > 0) break
    result.unshift(history[i])
    used += t
  }
  return result
}

function estimateTokens(text: string): number {
  if (!text) return 0
  let cjk = 0, other = 0
  for (const ch of text) {
    if (/[\u4e00-\u9fff\u3040-\u30ff]/.test(ch)) cjk++
    else other++
  }
  return Math.ceil(cjk * 1.5 + other / 4)
}

function mergeAdjacent(messages: OpenAIMessage[]): OpenAIMessage[] {
  const result: OpenAIMessage[] = []
  for (const m of messages) {
    const last = result[result.length - 1]
    // 仅当两条都是纯字符串内容时才合并；含图片（数组内容）的消息保持独立
    if (last && last.role === m.role && typeof last.content === 'string' && typeof m.content === 'string') {
      last.content = `${last.content}\n\n${m.content}`
    } else {
      result.push({ ...m })
    }
  }
  return result
}
