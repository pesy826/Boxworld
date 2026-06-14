import { db } from '../db'
import { callChatCompletion } from './apiService'
import { useChatStore } from '../stores/chatStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useCharacterStore } from '../stores/characterStore'
import { getActiveUtilityPrompt } from './utilityPrompts'
import { buildStickerListText, buildChatImageHint } from './promptBuilder'
import { generateComfyImage, generateImagePrompt, isComfyAvailable } from './comfyService'
import { timeService } from './timeService'
import { uuid } from '../utils/id'
import type { Chat, Character, Message } from '../types'

/** 群聊上下文取最近多少条消息 */
const MAX_GROUP_HISTORY = 60

/** 群成员人设注入上限（字符）。主卡人设往往很长，截太狠会丢关键设定 */
const MEMBER_DESC_MAX = 6000
const MEMBER_PERSONALITY_MAX = 2000
const MEMBER_SCENARIO_MAX = 1500
const MEMBER_MEMORY_MAX = 1000

// ==================== Prompt 构建 ====================

async function buildGroupPrompt(
  chat: Chat,
  mode: 'coarse' | 'fine' = 'coarse',
  opts?: { windingDown?: boolean },
): Promise<Array<{ role: 'system' | 'user'; content: string }>> {
  const settings = useSettingsStore.getState().settings
  if (!settings) throw new Error('设置未加载')

  const userName = settings.userPersona.name || '用户'
  const members = (chat.memberIds || [])
    .map((id) => useCharacterStore.getState().getById(id))
    .filter((c): c is Character => !!c)

  if (members.length === 0) throw new Error('群里没有角色成员')

  // 群时间：单卡世界群用主卡时间，全局群用全局时间
  const worldChar = chat.worldId ? useCharacterStore.getState().getById(chat.worldId) : undefined
  const now = worldChar ? timeService.nowForCharacter(worldChar) : timeService.now()
  const timeText = new Date(now).toLocaleString('zh-CN', { hour12: false })

  let template = mode === 'fine'
    ? (getActiveUtilityPrompt('group_fine') || getActiveUtilityPrompt('group_chat'))
    : getActiveUtilityPrompt('group_chat')
  if (!template) throw new Error('未找到群聊扮演 prompt')
  template = template
    .replaceAll('{{user}}', userName)
    .replaceAll('{{datetime}}', timeText)

  const parts: string[] = [template]

  parts.push(`\n【当前时间】\n${timeText}`)
  parts.push(`\n【群名】${chat.name || '群聊'}`)

  parts.push('\n【用户信息】')
  parts.push(`昵称：${userName}`)
  // 用户人设：优先世界主卡的 userProfile，否则取任一成员能解析到的
  const profileSource = worldChar || members[0]
  const userProfile = resolveUserProfileFor(profileSource)
  if (userProfile) parts.push(`人设：${userProfile}`)

  // 世界事件记录（单卡世界群）
  if (chat.worldId) {
    const ws = await db.worldSummaries.get(chat.worldId)
    if (ws?.content?.trim()) {
      parts.push('\n【这个世界已发生的事件记录】')
      parts.push(ws.content.trim())
    }
  }

  parts.push('\n【群成员人设】（speaker 字段必须使用这些名字）')
  for (const m of members) {
    parts.push(`\n## ${m.name}${m.npcRelation ? `（${m.npcRelation}）` : ''}`)
    if (m.description?.trim()) parts.push(`描述：${truncate(m.description, MEMBER_DESC_MAX)}`)
    if (m.personality?.trim()) parts.push(`性格：${truncate(m.personality, MEMBER_PERSONALITY_MAX)}`)
    if (m.scenario?.trim()) parts.push(`背景：${truncate(m.scenario, MEMBER_SCENARIO_MAX)}`)
    if (m.privateMemory?.trim()) parts.push(`TA 知道的近况：${truncate(m.privateMemory, MEMBER_MEMORY_MAX)}`)
  }

  // 可用表情列表
  const stickerText = buildStickerListText()
  if (stickerText) parts.push(`\n${stickerText}`)

  // ComfyUI 可用时注入"发图片"能力（speaker 仍必须写角色名）
  const imageHint = buildChatImageHint()
  if (imageHint) parts.push(`\n${imageHint}`)

  // 精细模式：群里不是人人在线、句句都接，鼓励克制（看到也可不回），冷场是常态
  if (mode === 'fine') {
    parts.push('\n【群聊氛围】像真实微信群：不是所有人都在线、都盯着手机，大量时间是没人说话的。角色可以互相搭话/接梗，但更多时候是"看到了但没必要回"。本轮没人有强烈动机开口，就让 messages 返回空数组让群安静下来——这很正常，不要为了热闹硬找人发言。')
  }

  // 临近轮数上限：让对话自然收尾，而不是被硬切断
  if (opts?.windingDown) {
    parts.push('\n【收尾提示】这轮群聊差不多该告一段落了。请让正在发言的角色用符合人设的方式自然地把话题收住——比如说自己要去吃饭/睡觉/有事先走/下次再聊之类，给一个自然的结束，而不是戛然而止。收尾后本轮之后不要再开启新话题。')
  }

  // 历史消息
  const all = useChatStore.getState().messagesByChat[chat.id] || []
  const history = all
    .filter((m) => m.type === 'text' || m.type === 'sticker' || m.type === 'image')
    .slice(-MAX_GROUP_HISTORY)

  const histLines: string[] = ['【群聊记录】']
  if (history.length === 0) {
    histLines.push('（群刚建立，还没有人说话）')
  } else {
    for (const m of history) {
      const who = m.role === 'user' ? userName : senderName(m, members)
      const content = m.type === 'sticker' ? `[表情：${m.content}]`
        : m.type === 'image' ? `[图片：${m.content || '图片'}]`
          : m.content
      histLines.push(`${who}: ${content}`)
    }
  }
  histLines.push('\n请根据上面的群聊记录，决定接下来哪些角色发言、说什么。严格按 JSON 格式输出。')

  return [
    { role: 'system', content: parts.join('\n') },
    { role: 'user', content: histLines.join('\n') },
  ]
}

function senderName(m: Message, members: Character[]): string {
  if (m.senderId) {
    const found = members.find((c) => c.id === m.senderId)
    if (found) return found.name
    const anyChar = useCharacterStore.getState().getById(m.senderId)
    if (anyChar) return anyChar.name
  }
  return '某成员'
}

function truncate(text: string, max: number): string {
  const t = text.trim()
  return t.length > max ? t.slice(0, max) + '…' : t
}

/** 解析角色视角下的用户人设（自己的 userProfile → NPC 回退所属世界主卡的） */
function resolveUserProfileFor(c?: Character): string {
  if (!c) return ''
  if (c.userProfile?.trim()) return c.userProfile.trim()
  if (c.isNpc && c.parentWorldId) {
    const mainChar = useCharacterStore.getState().getById(c.parentWorldId)
    if (mainChar?.userProfile?.trim()) return mainChar.userProfile.trim()
  }
  return ''
}

// ==================== 回复解析 ====================

export interface GroupReplyItem {
  senderId: string
  type: 'text' | 'sticker' | 'image'
  content: string
  /** type=image 时的英文文生图提示词 */
  imagePrompt?: string
}

function parseGroupReply(raw: string, members: Character[]): GroupReplyItem[] {
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
    const rawMessages = Array.isArray(obj.messages) ? obj.messages : []
    const result: GroupReplyItem[] = []
    for (const m of rawMessages) {
      if (!m || typeof m !== 'object') continue
      let content = String(m.content ?? '').trim()
      if (!content) continue
      const speakerName = String(m.speaker ?? '').trim()
      const member = matchMember(speakerName, members)
      if (!member) continue   // 不认识的发言人直接丢弃
      let type = m.type === 'sticker' ? 'sticker' : m.type === 'image' ? 'image' : 'text'
      const imagePrompt = typeof m.image_prompt === 'string' ? m.image_prompt.trim() : undefined

      // 兜底：模型常把表情写成纯 [表情名] 内联在 text 里（type 仍标 text）。
      // 若整条 content 就是 [xxx]，剥掉括号当作表情发送（渲染成表情图，查不到再回退文字）。
      if (type === 'text') {
        const bracket = content.match(/^[\[【](.+?)[\]】]$/)
        if (bracket && bracket[1].trim()) {
          type = 'sticker'
          content = bracket[1].trim()
        }
      }

      if (type === 'image' && !imagePrompt) {
        // 图片消息缺提示词 → 降级为文字
        result.push({ senderId: member.id, type: 'text', content })
      } else {
        result.push({ senderId: member.id, type: type as 'text' | 'sticker' | 'image', content, imagePrompt })
      }
    }
    return result
  } catch {
    return []
  }
}

/**
 * 名字匹配优先级：
 * 1. 精确匹配
 * 2. 去掉括号注释后精确匹配（模型常输出 "姜海（xxx的邻居）" 这种格式）
 * 3. speaker 以某成员名开头（多个命中取名字最长的）
 * 4. 成员名以 speaker 开头（speaker 是简称）
 * 5. 兜底：成员名在 speaker 中出现位置最靠前的（位置相同取更长的名字）
 */
function matchMember(name: string, members: Character[]): Character | undefined {
  if (!name) return undefined

  const exact = members.find((c) => c.name === name)
  if (exact) return exact

  // 去掉括号及之后的注释（中英文括号/方括号）
  const stripped = name.replace(/[（(【\[].*$/, '').trim()
  if (stripped && stripped !== name) {
    const e2 = members.find((c) => c.name === stripped)
    if (e2) return e2
  }

  const base = stripped || name

  // speaker 以成员名开头（"姜海哥" → 姜海）
  const starts = members
    .filter((c) => base.startsWith(c.name))
    .sort((a, b) => b.name.length - a.name.length)
  if (starts[0]) return starts[0]

  // 成员名以 speaker 开头（"姜" → 姜海）
  const rev = members.find((c) => c.name.startsWith(base))
  if (rev) return rev

  // 兜底：取在 speaker 字符串中出现位置最早的成员名
  let best: Character | undefined
  let bestIdx = Infinity
  for (const c of members) {
    const idx = name.indexOf(c.name)
    if (idx < 0) continue
    if (idx < bestIdx || (idx === bestIdx && c.name.length > (best?.name.length || 0))) {
      best = c
      bestIdx = idx
    }
  }
  return best
}

// ==================== 群聊调度器 ====================

type Listener = () => void

export interface GroupSchedulerStatus {
  bufferingUserInput: boolean
  awaitingResponse: boolean
  deliveringAssistant: boolean
}

class GroupChatScheduler {
  private chatId: string

  private userBuffer: string[] = []
  private userIdleTimer: number | null = null

  private queue: GroupReplyItem[] = []
  private deliveryTimer: number | null = null
  private currentBatchId: string | null = null

  private abortController: AbortController | null = null
  private awaitingResponse = false

  /** 精细模式多轮循环的中断标志 */
  private fineAborted = false

  private listeners = new Set<Listener>()

  constructor(chatId: string) {
    this.chatId = chatId
  }

  async submitUserMessage(text: string): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed) return

    this.cancelDelivery()
    this.cancelInflight()

    await useChatStore.getState().appendUserMessage(this.chatId, trimmed)
    this.userBuffer.push(trimmed)

    this.scheduleFlush()
    this.notify()
  }

  /** 用户发表情（desc = 表情描述名） */
  async submitUserSticker(desc: string): Promise<void> {
    const trimmed = desc.trim()
    if (!trimmed) return

    this.cancelDelivery()
    this.cancelInflight()

    await useChatStore.getState().appendUserSticker(this.chatId, trimmed)
    this.userBuffer.push(`[表情：${trimmed}]`)

    this.scheduleFlush()
    this.notify()
  }

  onUserTyping(): void {
    if (this.userBuffer.length > 0) this.scheduleFlush()
  }

  /** 手动触发一轮 AI 发言（"催一下"功能 / 重发） */
  async triggerRound(): Promise<{ ok: boolean; error?: string }> {
    this.cancelDelivery()
    this.cancelInflight()
    return this.runApiAndDeliver()
  }

  /** 重置调度状态（清空消息时用；保留监听者，不销毁实例） */
  reset(): void {
    this.cancelDelivery()
    this.cancelInflight()
    if (this.userIdleTimer) clearTimeout(this.userIdleTimer)
    this.userIdleTimer = null
    this.userBuffer = []
    this.notify()
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getStatus(): GroupSchedulerStatus {
    return {
      bufferingUserInput: this.userIdleTimer !== null,
      awaitingResponse: this.awaitingResponse,
      deliveringAssistant: this.queue.length > 0 || this.deliveryTimer !== null,
    }
  }

  destroy(): void {
    this.cancelDelivery()
    this.cancelInflight()
    if (this.userIdleTimer) clearTimeout(this.userIdleTimer)
    this.userIdleTimer = null
    this.userBuffer = []
    this.listeners.clear()
  }

  private scheduleFlush(): void {
    if (this.userIdleTimer) clearTimeout(this.userIdleTimer)
    const settings = useSettingsStore.getState().settings
    const idleMs = settings?.chatBehavior?.userIdleMs ?? 3000
    this.userIdleTimer = window.setTimeout(() => {
      this.userIdleTimer = null
      this.flush()
    }, idleMs)
    this.notify()
  }

  private async flush(): Promise<void> {
    if (this.userBuffer.length === 0) return
    this.userBuffer = []
    this.notify()
    await this.runApiAndDeliver()
  }

  private async runApiAndDeliver(): Promise<{ ok: boolean; error?: string }> {
    const settings = useSettingsStore.getState().settings
    if (!settings) return { ok: false, error: '设置未加载' }

    const chat = useChatStore.getState().chats.find((c) => c.id === this.chatId)
    if (!chat || chat.type !== 'group') return { ok: false, error: '群聊不存在' }

    const members = (chat.memberIds || [])
      .map((id) => useCharacterStore.getState().getById(id))
      .filter((c): c is Character => !!c)
    if (members.length === 0) return { ok: false, error: '群里没有角色成员' }

    // 精细模式：多轮循环（每轮只选 1~2 角色，分发完再判断下一轮）
    if (settings.groupChatMode === 'fine') {
      return this.runFineRounds(chat, members)
    }

    this.awaitingResponse = true
    this.notify()
    const controller = new AbortController()
    this.abortController = controller

    try {
      const messages = await buildGroupPrompt(chat)
      if (controller.signal.aborted) return { ok: false, error: '已取消' }

      const result = await callChatCompletion(
        settings.apiConfig.primary,
        settings.apiConfig,
        messages,
        {
          signal: controller.signal,
          debugPurpose: 'im_chat',
          debugCharacterName: chat.name || '群聊',
          debugEndpointName: 'primary',
        },
      )

      this.awaitingResponse = false
      this.abortController = null

      if (!result.ok) {
        this.notify()
        return { ok: false, error: result.error }
      }

      const parsed = parseGroupReply(result.content, members)
      if (parsed.length === 0) {
        this.notify()
        return { ok: true }
      }

      this.queue = parsed
      this.currentBatchId = uuid()
      this.notify()

      const thinkMs = settings.chatBehavior?.assistantThinkingMs ?? 1500
      this.deliveryTimer = window.setTimeout(() => {
        this.deliveryTimer = null
        this.deliverNext()
      }, thinkMs)

      return { ok: true }
    } catch (e: any) {
      this.awaitingResponse = false
      this.abortController = null
      this.notify()
      if (e?.name === 'AbortError') return { ok: false, error: '已取消' }
      return { ok: false, error: e?.message || String(e) }
    }
  }

  /** 精细模式默认轮数上限（settings.groupFineMaxRounds 未设时用），防止角色互聊停不下来 */
  private static readonly DEFAULT_FINE_ROUNDS = 6

  /** 可中断的 sleep：精细模式轮次间隔用；被打断（fineAborted）则提前返回 true */
  private sleepInterruptible(ms: number): Promise<boolean> {
    return new Promise((resolve) => {
      const start = Date.now()
      const tick = () => {
        if (this.fineAborted) { resolve(true); return }
        if (Date.now() - start >= ms) { resolve(false); return }
        this.deliveryTimer = window.setTimeout(tick, 300)
      }
      this.deliveryTimer = window.setTimeout(tick, 300)
    })
  }

  /**
   * 精细模式：多轮调用。每轮调用 fine prompt 选出 1~2 个角色发言，
   * 同步分发完这一批，再读最新历史判断下一轮；空 messages 或用户打断则结束。
   * 轮数上限可在设置里调（groupFineMaxRounds）；临近上限时注入"自然收尾"提示，
   * 让群聊像真人一样把话题收住（去吃饭/睡觉等），而不是被硬切断。
   */
  private async runFineRounds(chat: Chat, members: Character[]): Promise<{ ok: boolean; error?: string }> {
    const settings = useSettingsStore.getState().settings
    if (!settings) return { ok: false, error: '设置未加载' }

    this.fineAborted = false
    let lastError: string | undefined

    const maxRounds = Math.max(1, settings.groupFineMaxRounds || GroupChatScheduler.DEFAULT_FINE_ROUNDS)

    for (let round = 0; round < maxRounds; round++) {
      if (this.fineAborted) return { ok: true }

      // 非首轮之间留一段"群里下一个人隔了会儿才看到/才接话"的间隔，避免轮次刷得太快显得假
      if (round > 0) {
        const cb = settings.chatBehavior
        const gap = (cb?.assistantThinkingMs ?? 1500) + 1500 + Math.random() * 3000  // ~3-6s
        const interrupted = await this.sleepInterruptible(gap)
        if (interrupted || this.fineAborted) return { ok: true }
      }

      // 最后一轮（或只有 1 轮时的唯一一轮）让对话自然收尾
      const windingDown = round >= maxRounds - 1

      this.awaitingResponse = true
      this.notify()
      const controller = new AbortController()
      this.abortController = controller

      let parsed: GroupReplyItem[] = []
      try {
        const messages = await buildGroupPrompt(chat, 'fine', { windingDown })
        if (controller.signal.aborted || this.fineAborted) {
          this.awaitingResponse = false
          this.abortController = null
          return { ok: true }
        }

        const result = await callChatCompletion(
          settings.apiConfig.primary,
          settings.apiConfig,
          messages,
          {
            signal: controller.signal,
            debugPurpose: 'im_chat',
            debugCharacterName: chat.name || '群聊',
            debugEndpointName: 'primary',
          },
        )

        this.awaitingResponse = false
        this.abortController = null

        if (!result.ok) {
          this.notify()
          lastError = result.error
          break
        }
        parsed = parseGroupReply(result.content, members)
      } catch (e: any) {
        this.awaitingResponse = false
        this.abortController = null
        this.notify()
        if (e?.name === 'AbortError') return { ok: true }
        lastError = e?.message || String(e)
        break
      }

      // 空数组 = 本轮无人发言，循环结束
      if (parsed.length === 0) {
        this.notify()
        break
      }

      // 同步分发这一批（等它全部发完再进入下一轮）
      const delivered = await this.deliverBatch(parsed)
      if (!delivered || this.fineAborted) return { ok: true }
    }

    this.notify()
    return lastError ? { ok: false, error: lastError } : { ok: true }
  }

  /**
   * 精细模式：按打字节奏分发一整批消息，全部发完后 resolve。
   * 期间若被打断（fineAborted / 实例 reset）返回 false。
   */
  private deliverBatch(items: GroupReplyItem[]): Promise<boolean> {
    return new Promise((resolve) => {
      const batchId = uuid()
      this.currentBatchId = batchId
      const queue = [...items]
      this.notify()

      const settings = useSettingsStore.getState().settings
      const cb = settings?.chatBehavior
      const perChar = cb?.assistantTypingMsPerChar ?? 80
      const minPause = cb?.assistantMinPauseMs ?? 600
      const maxPause = cb?.assistantMaxPauseMs ?? 4000
      const thinkMs = cb?.assistantThinkingMs ?? 1500

      const step = async () => {
        if (this.fineAborted || this.currentBatchId !== batchId) {
          resolve(false)
          return
        }
        if (queue.length === 0) {
          this.currentBatchId = null
          this.notify()
          resolve(true)
          return
        }

        const item = queue.shift()!
        if (item.type === 'image' && item.imagePrompt && isComfyAvailable()) {
          let imageData: string | undefined
          try {
            const finalPrompt = await generateImagePrompt(item.imagePrompt)
            const gen = await generateComfyImage(finalPrompt)
            if (gen.ok && gen.image) imageData = gen.image
            else console.warn('[group-scheduler] 配图生成失败：', gen.error)
          } catch (e) {
            console.warn('[group-scheduler] 配图生成异常：', e)
          }
          await useChatStore.getState().appendAssistantMessageWithBatch(
            this.chatId,
            imageData
              ? { type: 'image', content: item.content, senderId: item.senderId, imageData }
              : { type: 'text', content: item.content, senderId: item.senderId },
            batchId,
          )
        } else {
          await useChatStore.getState().appendAssistantMessageWithBatch(
            this.chatId,
            { type: item.type === 'image' ? 'text' : item.type, content: item.content, senderId: item.senderId },
            batchId,
          )
        }

        if (this.fineAborted || this.currentBatchId !== batchId) {
          resolve(false)
          return
        }

        if (queue.length === 0) {
          this.currentBatchId = null
          this.notify()
          resolve(true)
          return
        }

        const next = queue[0]
        const base = next.content.length * perChar
        const jitter = 0.7 + Math.random() * 0.6
        const delay = Math.max(minPause, Math.min(maxPause, base * jitter))
        this.notify()
        this.deliveryTimer = window.setTimeout(() => {
          this.deliveryTimer = null
          step()
        }, delay)
      }

      this.deliveryTimer = window.setTimeout(() => {
        this.deliveryTimer = null
        step()
      }, thinkMs)
    })
  }

  private async deliverNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.currentBatchId = null
      this.notify()
      return
    }

    const item = this.queue.shift()!
    const batchId = this.currentBatchId || uuid()

    if (item.type === 'image' && item.imagePrompt && isComfyAvailable()) {
      // 群聊图片消息：分发时实时出图；失败降级为文字
      let imageData: string | undefined
      try {
        const finalPrompt = await generateImagePrompt(item.imagePrompt)
        const gen = await generateComfyImage(finalPrompt)
        if (gen.ok && gen.image) imageData = gen.image
        else console.warn('[group-scheduler] 配图生成失败：', gen.error)
      } catch (e) {
        console.warn('[group-scheduler] 配图生成异常：', e)
      }
      await useChatStore.getState().appendAssistantMessageWithBatch(
        this.chatId,
        imageData
          ? { type: 'image', content: item.content, senderId: item.senderId, imageData }
          : { type: 'text', content: item.content, senderId: item.senderId },
        batchId,
      )
    } else {
      await useChatStore.getState().appendAssistantMessageWithBatch(
        this.chatId,
        { type: item.type === 'image' ? 'text' : item.type, content: item.content, senderId: item.senderId },
        batchId,
      )
    }

    if (this.queue.length === 0) {
      this.currentBatchId = null
      this.notify()
      return
    }

    const settings = useSettingsStore.getState().settings
    const cb = settings?.chatBehavior
    const next = this.queue[0]
    const perChar = cb?.assistantTypingMsPerChar ?? 80
    const minPause = cb?.assistantMinPauseMs ?? 600
    const maxPause = cb?.assistantMaxPauseMs ?? 4000
    const base = next.content.length * perChar
    const jitter = 0.7 + Math.random() * 0.6
    const delay = Math.max(minPause, Math.min(maxPause, base * jitter))

    this.notify()
    this.deliveryTimer = window.setTimeout(() => {
      this.deliveryTimer = null
      this.deliverNext()
    }, delay)
  }

  private cancelDelivery(): void {
    // 打断精细模式多轮循环
    this.fineAborted = true
    if (this.deliveryTimer) {
      clearTimeout(this.deliveryTimer)
      this.deliveryTimer = null
    }
    if (this.queue.length > 0) {
      console.log(`[group-scheduler] 中断分发，丢弃 ${this.queue.length} 条未发出消息`)
      this.queue = []
    }
    this.currentBatchId = null
  }

  private cancelInflight(): void {
    this.fineAborted = true
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    this.awaitingResponse = false
  }

  private notify(): void {
    this.listeners.forEach((l) => l())
  }
}

const groupSchedulers = new Map<string, GroupChatScheduler>()

export function getGroupScheduler(chatId: string): GroupChatScheduler {
  let s = groupSchedulers.get(chatId)
  if (!s) {
    s = new GroupChatScheduler(chatId)
    groupSchedulers.set(chatId, s)
  }
  return s
}

export function disposeGroupScheduler(chatId: string): void {
  const s = groupSchedulers.get(chatId)
  if (s) {
    s.destroy()
    groupSchedulers.delete(chatId)
  }
}