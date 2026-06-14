import { db } from '../db'
import { callChatCompletion } from './apiService'
import { useSettingsStore } from '../stores/settingsStore'
import { useCharacterStore } from '../stores/characterStore'
import { useChatStore } from '../stores/chatStore'
import { useMomentStore } from '../stores/momentStore'
import { useTickLogStore } from '../stores/tickLogStore'
import { getActiveUtilityPrompt } from './utilityPrompts'
import { timeService } from './timeService'
import { getScheduler } from './messageScheduler'
import { isComfyAvailable, generateComfyImage, generateImagePrompt } from './comfyService'
import type { Character, Message, Moment, MomentComment } from '../types'

export interface ThinkingResult {
  ok: boolean
  error?: string
  appliedPrivateMessages?: number
  appliedMoment?: boolean
  appliedCommentReplies?: number
  appliedUserInteractions?: number
  appliedMemorySync?: number
}

interface ThinkingReply {
  private_messages: Array<{ type: 'text' | 'sticker'; content: string }>
  should_post_moment: boolean
  moment_content?: string | null
  moment_mood?: string | null
  /** 朋友圈配图的英文 SD 提示词（仅 ComfyUI 可用时 AI 才会输出） */
  moment_image_prompt?: string | null
  /** 配图的中文一句话描述（作为图片描述存档，供其他角色"看图"） */
  moment_image_desc?: string | null
  comment_replies: Array<{ moment_id: string; content: string }>
  user_moment_interactions: Array<{ moment_id: string; action: 'like' | 'comment'; content?: string }>
  memory_sync: string[]
  mood?: string
  internal_notes?: string
}

const MAX_HISTORY = 30
const MAX_OWN_MOMENTS = 5
const MAX_USER_MOMENTS = 10

export async function thinkForCharacter(characterId: string, runId: string): Promise<ThinkingResult> {
  const log = (entry: any) => useTickLogStore.getState().log({ ...entry, runId })

  const settings = useSettingsStore.getState().settings
  if (!settings) return { ok: false, error: '设置未加载' }

  const character = useCharacterStore.getState().getById(characterId)
  if (!character) return { ok: false, error: '角色不存在' }

  const primary = settings.apiConfig.primary
  if (!primary.apiKey || !primary.baseUrl || !primary.model) {
    await log({ stage: 'decide', result: 'fail', characterId, characterName: character.name, reason: '主 API 未配置' })
    return { ok: false, error: '主 API 未配置' }
  }

  const promptTemplate = getActiveUtilityPrompt('thinking')
  if (!promptTemplate) {
    await log({ stage: 'decide', result: 'fail', characterId, characterName: character.name, reason: '未找到深思 prompt' })
    return { ok: false, error: '未找到深思 prompt' }
  }

  const context = await buildContext(character)

  // NPC 追加所属世界主卡的背景档案（中性措辞：是否认识由 NPC 自己的人设决定）
  let mainCharBrief = ''
  if (character.isNpc && character.parentWorldId) {
    const mainChar = useCharacterStore.getState().getById(character.parentWorldId)
    if (mainChar) {
      mainCharBrief = `

【世界背景资料：本世界主要角色「${mainChar.name}」的档案】
（注意：你是否认识 ${mainChar.name}、对 TA 了解多少，完全以你自己的人设和关系设定为准。若没有交集则你并不认识 TA，不应表现出知道这些信息）
${(mainChar.description || '').slice(0, 2000)}`
    }
  }

  // 用户人设：自己的 userProfile → NPC 回退主卡的
  let userProfile = character.userProfile?.trim() || ''
  if (!userProfile && character.isNpc && character.parentWorldId) {
    userProfile = useCharacterStore.getState().getById(character.parentWorldId)?.userProfile?.trim() || ''
  }

  const systemPrompt = `${promptTemplate}

【你的人设】
姓名：${character.name}
描述：${character.description}
性格：${character.personality}
${character.scenario ? `场景：${character.scenario}` : ''}${mainCharBrief}

【用户信息】
昵称：${settings.userPersona.name}${userProfile ? `\n人设：${userProfile}` : ''}


【当前时间】
${context.currentTimeText}
距离你上次和用户互动：${context.sinceLastInteractionText}${buildComfyHint()}`

  const userPrompt = buildUserPromptContent(context)

  const result = await callChatCompletion(
    primary,
    settings.apiConfig,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    {
      debugPurpose: 'thinking',
      debugCharacterName: character.name,
      debugEndpointName: 'primary',
    },
  )

  if (!result.ok) {
    await log({ stage: 'decide', result: 'fail', characterId, characterName: character.name, reason: `API 失败：${result.error}` })
    return { ok: false, error: result.error }
  }

  const parsed = parseThinkingReply(result.content)
  if (!parsed) {
    await log({
      stage: 'decide', result: 'fail',
      characterId, characterName: character.name,
      reason: '无法解析返回', detail: result.content.slice(0, 200),
    })
    return { ok: false, error: '解析失败' }
  }

  const applied = await applyThinkingResult(character, parsed, context.ownMoments, context.userMoments)

  await log({
    stage: 'decide', result: 'success',
    characterId, characterName: character.name,
    reason: `私聊 ${applied.appliedPrivateMessages} | 朋友圈 ${applied.appliedMoment ? '✓' : '×'} | 评论回复 ${applied.appliedCommentReplies} | 互动用户朋友圈 ${applied.appliedUserInteractions} | 记忆同步 ${applied.appliedMemorySync}`,
    detail: parsed.internal_notes || '',
  })

  return { ok: true, ...applied }
}

interface ThinkingContext {
  currentTimeText: string
  sinceLastInteractionText: string
  recentHistory: Message[]
  ownMoments: Moment[]
  userMoments: Moment[]
  pendingCommentMoments: Array<{ moment: Moment; comments: MomentComment[] }>
  /** 所属世界的统一事件记忆（仅单卡世界内有） */
  worldSummaryText: string
  /** 角色现有的私有记忆 */
  privateMemoryText: string
}

async function buildContext(character: Character): Promise<ThinkingContext> {
  const now = timeService.nowForCharacter(character)
  const currentTimeText = new Date(now).toLocaleString('zh-CN', { hour12: false })

  const chat = await db.chats.where('characterId').equals(character.id).first()
  let recentHistory: Message[] = []
  if (chat) {
    const all = await db.messages.where('chatId').equals(chat.id).toArray()
    all.sort((a, b) => a.sequence - b.sequence)
    recentHistory = all.slice(-MAX_HISTORY)
  }

  const lastInteraction = chat?.lastCharacterActiveAt || chat?.lastMessageAt || 0
  const sinceMs = lastInteraction > 0 ? now - lastInteraction : -1
  const sinceLastInteractionText = sinceMs < 0
    ? '从未互动'
    : sinceMs < 3600 * 1000 ? `${Math.floor(sinceMs / 60000)} 分钟`
      : sinceMs < 86400 * 1000 ? `${Math.floor(sinceMs / 3600000)} 小时`
        : `${Math.floor(sinceMs / 86400000)} 天`

  const ownMoments = await db.moments
    .where('authorId').equals(character.id)
    .reverse().sortBy('timestamp')
    .then((arr) => arr.slice(0, MAX_OWN_MOMENTS))

  const userMoments = await db.moments
    .where('authorId').equals('user')
    .reverse().sortBy('timestamp')
    .then((arr) => arr.slice(0, MAX_USER_MOMENTS))

  const pendingCommentMoments: ThinkingContext['pendingCommentMoments'] = []
  for (const m of ownMoments) {
    const comments = await db.momentComments.where('momentId').equals(m.id).toArray()
    if (comments.length === 0) continue
    comments.sort((a, b) => a.timestamp - b.timestamp)
    const lastNonCharacter = [...comments].reverse().find((c) => c.authorId !== character.id)
    if (!lastNonCharacter) continue
    const hasReplied = comments.some((c) => c.authorId === character.id && c.timestamp > lastNonCharacter.timestamp)
    if (!hasReplied) pendingCommentMoments.push({ moment: m, comments })
  }

  // 世界统一事件记忆（主卡用自己 id，NPC 用所属世界主卡 id）
  const worldId = character.isNpc ? character.parentWorldId : character.id
  let worldSummaryText = ''
  if (worldId) {
    const ws = await db.worldSummaries.get(worldId)
    worldSummaryText = ws?.content?.trim() || ''
  }

  return {
    currentTimeText, sinceLastInteractionText,
    recentHistory, ownMoments, userMoments, pendingCommentMoments,
    worldSummaryText,
    privateMemoryText: character.privateMemory?.trim() || '',
  }
}

function buildUserPromptContent(ctx: ThinkingContext): string {
  const parts: string[] = []

  if (ctx.recentHistory.length > 0) {
    parts.push('【最近聊天记录】')
    for (const m of ctx.recentHistory) {
      const who = m.role === 'user' ? '用户' : '我'
      const content = m.type === 'text' || m.type === 'sticker' ? m.content : `[${m.type}]`
      parts.push(`${who}: ${content}`)
    }
  } else {
    parts.push('【最近聊天记录】\n（无）')
  }

  if (ctx.ownMoments.length > 0) {
    parts.push('\n【我自己的朋友圈（最近）】')
    for (const m of ctx.ownMoments) {
      const t = new Date(m.timestamp).toLocaleString('zh-CN', { hour12: false })
      const img = renderImageDescriptions(m.images, m.imageDescriptions)
      parts.push(`[id=${m.id}] ${t}\n${m.content}${img ? '\n' + img : ''}`)
    }
  }

  if (ctx.userMoments.length > 0) {
    parts.push('\n【用户的朋友圈（最近）】')
    for (const m of ctx.userMoments) {
      const t = new Date(m.timestamp).toLocaleString('zh-CN', { hour12: false })
      const img = renderImageDescriptions(m.images, m.imageDescriptions)
      const liked = m.likes.includes('placeholder') // 占位，下面单独标注
      parts.push(`[id=${m.id}] ${t}\n${m.content}${img ? '\n' + img : ''}`)
    }
    parts.push('（如果你想对用户的某条朋友圈点赞或评论，用 user_moment_interactions 字段，moment_id 用上面的 id）')
  }

  if (ctx.pendingCommentMoments.length > 0) {
    parts.push('\n【我朋友圈下的待回复评论】')
    for (const pcm of ctx.pendingCommentMoments) {
      parts.push(`原朋友圈 [id=${pcm.moment.id}]: ${pcm.moment.content.slice(0, 60)}`)
      for (const c of pcm.comments) {
        const who = c.authorId === 'user' ? '用户' : '我'
        parts.push(`  ${who}: ${c.content}`)
      }
    }
  }

  if (ctx.worldSummaryText) {
    parts.push('\n【世界事件记录（客观视角，记录这个世界已发生的事）】')
    parts.push(ctx.worldSummaryText)
    parts.push('\n【我已有的私有记忆】')
    parts.push(ctx.privateMemoryText || '（暂无）')
    parts.push('（对比上面两段：世界事件记录里如果有"按我的身份本应知道、但我私有记忆里没有"的事件，用 memory_sync 字段逐条同步给我）')
  }

  parts.push('\n请综合以上信息，决定你此刻要做什么。')
  return parts.join('\n')
}

function renderImageDescriptions(images: string[], descriptions: string[]): string {
  if (!images || images.length === 0) return ''
  const lines: string[] = []
  for (let i = 0; i < images.length; i++) {
    const desc = descriptions?.[i]
    if (!desc || desc.startsWith('[图片：')) continue
    lines.push(`[图：${desc}]`)
  }
  return lines.join('\n')
}

function parseThinkingReply(raw: string): ThinkingReply | null {
  const cleaned = raw.trim()
  let jsonText = cleaned
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) jsonText = fence[1]
  else {
    const fb = cleaned.indexOf('{')
    const lb = cleaned.lastIndexOf('}')
    if (fb >= 0 && lb > fb) jsonText = cleaned.slice(fb, lb + 1)
  }
  try {
    const obj = JSON.parse(jsonText)
    const privateMessages = Array.isArray(obj.private_messages)
      ? obj.private_messages.map((m: any) => ({
        type: m?.type === 'sticker' ? 'sticker' : 'text',
        content: String(m?.content ?? '').trim(),
      })).filter((m: any) => m.content)
      : []
    const commentReplies = Array.isArray(obj.comment_replies)
      ? obj.comment_replies.map((c: any) => ({
        moment_id: String(c?.moment_id ?? ''),
        content: String(c?.content ?? '').trim(),
      })).filter((c: any) => c.moment_id && c.content)
      : []
    const userInteractions = Array.isArray(obj.user_moment_interactions)
      ? obj.user_moment_interactions.map((c: any) => ({
        moment_id: String(c?.moment_id ?? ''),
        action: c?.action === 'comment' ? 'comment' : 'like',
        content: typeof c?.content === 'string' ? c.content.trim() : undefined,
      })).filter((c: any) => c.moment_id)
      : []
    const memorySync = Array.isArray(obj.memory_sync)
      ? obj.memory_sync.map((x: any) => String(x ?? '').trim()).filter((x: string) => x)
      : []
    return {
      private_messages: privateMessages,
      should_post_moment: !!obj.should_post_moment,
      moment_content: typeof obj.moment_content === 'string' ? obj.moment_content : null,
      moment_mood: typeof obj.moment_mood === 'string' ? obj.moment_mood : null,
      moment_image_prompt: typeof obj.moment_image_prompt === 'string' ? obj.moment_image_prompt.trim() || null : null,
      moment_image_desc: typeof obj.moment_image_desc === 'string' ? obj.moment_image_desc.trim() || null : null,
      comment_replies: commentReplies,
      user_moment_interactions: userInteractions,
      memory_sync: memorySync,
      mood: typeof obj.mood === 'string' ? obj.mood : undefined,
      internal_notes: typeof obj.internal_notes === 'string' ? obj.internal_notes : undefined,
    }
  } catch {
    return null
  }
}

async function applyThinkingResult(
  character: Character,
  parsed: ThinkingReply,
  ownMoments: Moment[],
  userMoments: Moment[],
): Promise<{ appliedPrivateMessages: number; appliedMoment: boolean; appliedCommentReplies: number; appliedUserInteractions: number; appliedMemorySync: number }> {
  let appliedPrivateMessages = 0
  let appliedMoment = false
  let appliedCommentReplies = 0
  let appliedUserInteractions = 0
  let appliedMemorySync = 0

  // 1. 私聊
  if (parsed.private_messages.length > 0) {
    const chat = await useChatStore.getState().getOrCreateChat(character.id)
    const scheduler = getScheduler(chat.id, character.id)
    await scheduler.enqueueProactiveMessages(
      parsed.private_messages.map((m) => ({ type: m.type, content: m.content, mood: parsed.mood })),
    )
    appliedPrivateMessages = parsed.private_messages.length
  }

  // 2. 朋友圈（ComfyUI 可用且 AI 给了配图提示词时，先出图再发；失败则发纯文字）
  if (parsed.should_post_moment && parsed.moment_content?.trim()) {
    let images: string[] = []
    let imageDescriptions: string[] = []
    if (parsed.moment_image_prompt && isComfyAvailable()) {
      try {
        const finalPrompt = await generateImagePrompt(parsed.moment_image_prompt)
        const gen = await generateComfyImage(finalPrompt)
        if (gen.ok && gen.image) {
          images = [gen.image]
          imageDescriptions = [parsed.moment_image_desc || '配图']
        } else {
          console.warn('[boxworld] 朋友圈配图生成失败：', gen.error)
        }
      } catch (e) {
        console.warn('[boxworld] 朋友圈配图生成异常：', e)
      }
    }
    await useMomentStore.getState().addMoment({
      authorId: character.id,
      content: parsed.moment_content.trim(),
      images,
      imageDescriptions,
      imageAnalyzed: true,
      timestamp: timeService.nowForCharacter(character),
      likes: [],
      visibility: character.soloModeEntered ? 'solo' : 'public',
      soloWorldCharacterId: character.soloModeEntered ? character.id : undefined,
    })
    appliedMoment = true
  }

  // 3. 回复自己朋友圈下的评论
  const ownMomentIds = new Set(ownMoments.map((m) => m.id))
  for (const reply of parsed.comment_replies) {
    if (!ownMomentIds.has(reply.moment_id)) continue
    await useMomentStore.getState().addComment(reply.moment_id, character.id, reply.content)
    appliedCommentReplies++
  }

  // 4. 主动评论/点赞用户朋友圈
  const userMomentIds = new Set(userMoments.map((m) => m.id))
  for (const inter of parsed.user_moment_interactions) {
    if (!userMomentIds.has(inter.moment_id)) continue
    if (inter.action === 'like') {
      const m = useMomentStore.getState().moments.find((x) => x.id === inter.moment_id)
      if (m && !m.likes.includes(character.id)) {
        await useMomentStore.getState().toggleLike(inter.moment_id, character.id)
        appliedUserInteractions++
      }
    } else if (inter.action === 'comment' && inter.content) {
      await useMomentStore.getState().addComment(inter.moment_id, character.id, inter.content)
      appliedUserInteractions++
    }
  }

  // 5. 记忆同步：写入角色私有记忆
  if (parsed.memory_sync.length > 0) {
    const existing = character.privateMemory?.trim() || ''
    const existingLines = new Set(
      existing.split('\n').map((l) => l.trim()).filter(Boolean),
    )
    const newLines = parsed.memory_sync.filter((l) => !existingLines.has(l.trim()))
    if (newLines.length > 0) {
      const merged = trimPrivateMemory(
        existing ? `${existing}\n${newLines.join('\n')}` : newLines.join('\n'),
      )
      await useCharacterStore.getState().update(character.id, { privateMemory: merged })
      appliedMemorySync = newLines.length
    }
  }

  return { appliedPrivateMessages, appliedMoment, appliedCommentReplies, appliedUserInteractions, appliedMemorySync }
}

/** ComfyUI 可用时，给深思 prompt 动态追加配图能力说明（移动端/未启用时不注入，AI 不会输出相关字段） */
function buildComfyHint(): string {
  if (!isComfyAvailable()) return ''
  return `

【朋友圈配图能力】
如果你决定发朋友圈（should_post_moment 为 true），且这条朋友圈"配一张图会更自然"（如晒美食、风景、自拍、宠物、手工成果等），你可以在 JSON 中额外输出两个字段：
- "moment_image_prompt"：英文的文生图提示词（Stable Diffusion 风格，逗号分隔的英文标签/短语，描述画面内容、构图、光线氛围。不要出现人名，人物外貌按你的人设描述）
- "moment_image_desc"：这张图的中文一句话描述（20-40 字，给别人"看到"这张图时的客观描述）
注意：不是每条朋友圈都要配图。纯抒发心情、吐槽的内容通常不配图。不配图时这两个字段给 null 或省略。`
}

/** 私有记忆上限保护：超过上限时丢弃最老的行 */
const PRIVATE_MEMORY_MAX_CHARS = 2000
function trimPrivateMemory(text: string): string {
  if (text.length <= PRIVATE_MEMORY_MAX_CHARS) return text
  const lines = text.split('\n')
  while (lines.length > 1 && lines.join('\n').length > PRIVATE_MEMORY_MAX_CHARS) {
    lines.shift()
  }
  return lines.join('\n')
}
