import { buildPrompt } from './promptBuilder'
import { callChatCompletion } from './apiService'
import { parseReply } from './replyParser'
import { useChatStore } from '../stores/chatStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useCharacterStore } from '../stores/characterStore'
import { usePresetStore } from '../stores/presetStore'
import { timeService } from './timeService'
import { generateImage, refineImagePrompt, isImageGenAvailable } from './imageGenService'
import { uuid } from '../utils/id'
import type { Character, Preset } from '../types'

type Listener = () => void

export interface SchedulerStatus {
    bufferingUserInput: boolean
    awaitingResponse: boolean
    deliveringAssistant: boolean
}

class ChatScheduler {
    private chatId: string
    private characterId: string

    private userBuffer: string[] = []
    private userIdleTimer: number | null = null

    private assistantQueue: Array<{ type: 'text' | 'sticker' | 'image'; content: string; imagePrompt?: string; mood?: string; sceneHint?: string | null }> = []
    private deliveryTimer: number | null = null
    private currentBatchId: string | null = null

    private abortController: AbortController | null = null
    private awaitingResponse = false

    private listeners = new Set<Listener>()

    constructor(chatId: string, characterId: string) {
        this.chatId = chatId
        this.characterId = characterId
    }

    async submitUserMessage(text: string): Promise<void> {
        const trimmed = text.trim()
        if (!trimmed) return

        this.cancelAssistantDelivery()
        this.cancelInflightRequest()

        await useChatStore.getState().appendUserMessage(this.chatId, trimmed)
        this.userBuffer.push(trimmed)

        this.scheduleFlush()
        this.notify()
    }

    /** 用户发表情（desc = 表情描述名）；与文本一样进入缓冲，停止操作后统一触发 API */
    async submitUserSticker(desc: string): Promise<void> {
        const trimmed = desc.trim()
        if (!trimmed) return

        this.cancelAssistantDelivery()
        this.cancelInflightRequest()

        await useChatStore.getState().appendUserSticker(this.chatId, trimmed)
        this.userBuffer.push(`[表情：${trimmed}]`)

        this.scheduleFlush()
        this.notify()
    }

    /** 用户发图片（imageData = dataURL）；与文本一样进入缓冲，停止操作后统一触发 API（模型直接读图） */
    async submitUserImage(imageData: string): Promise<void> {
        if (!imageData) return

        this.cancelAssistantDelivery()
        this.cancelInflightRequest()

        await useChatStore.getState().appendUserImage(this.chatId, imageData)
        this.userBuffer.push('[我发了一张图片]')

        this.scheduleFlush()
        this.notify()
    }

    onUserTyping(): void {
        if (this.userBuffer.length > 0) {
            this.scheduleFlush()
        }
    }

    flushImmediately(): void {
        if (this.userBuffer.length > 0 && this.userIdleTimer) {
            clearTimeout(this.userIdleTimer)
            this.userIdleTimer = null
            this.flush()
        }
    }

    async regenerate(): Promise<{ ok: boolean; error?: string }> {
        this.cancelAssistantDelivery()
        this.cancelInflightRequest()

        const settings = useSettingsStore.getState().settings
        if (!settings) return { ok: false, error: '设置未加载' }
        const character = useCharacterStore.getState().getById(this.characterId)
        if (!character) return { ok: false, error: '角色不存在' }
        const preset = pickPreset(character, 'im')
        if (!preset) return { ok: false, error: '没有可用的微信预设' }

        return this.runApiAndDeliver(character, preset, settings)
    }

    async enqueueProactiveMessages(
        items: Array<{ type: 'text' | 'sticker'; content: string; mood?: string }>,
    ): Promise<void> {
        if (items.length === 0) return

        const isCurrentlyDelivering = this.assistantQueue.length > 0 || this.deliveryTimer !== null

        // 主动消息作为一个新批次
        if (!isCurrentlyDelivering || !this.currentBatchId) {
            this.currentBatchId = uuid()
        }

        this.assistantQueue.push(...items.map((m) => ({ ...m, sceneHint: null })))
        this.notify()

        if (!isCurrentlyDelivering) {
            const settings = useSettingsStore.getState().settings
            const thinkMs = settings?.chatBehavior?.assistantThinkingMs ?? 1500
            this.deliveryTimer = window.setTimeout(() => {
                this.deliveryTimer = null
                this.deliverNext()
            }, thinkMs)
        }
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    getStatus(): SchedulerStatus {
        return {
            bufferingUserInput: this.userIdleTimer !== null,
            awaitingResponse: this.awaitingResponse,
            deliveringAssistant: this.assistantQueue.length > 0 || this.deliveryTimer !== null,
        }
    }

    destroy(): void {
        this.cancelAssistantDelivery()
        this.cancelInflightRequest()
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

        const settings = useSettingsStore.getState().settings
        if (!settings) return
        const character = useCharacterStore.getState().getById(this.characterId)
        if (!character) return
        const preset = pickPreset(character, 'im')
        if (!preset) return

        await this.runApiAndDeliver(character, preset, settings)
    }

    private async runApiAndDeliver(
        character: Character,
        preset: Preset,
        settings: NonNullable<ReturnType<typeof useSettingsStore.getState>['settings']>,
    ): Promise<{ ok: boolean; error?: string }> {
        this.awaitingResponse = true
        this.notify()
        this.abortController = new AbortController()

        try {
            const history = useChatStore.getState().messagesByChat[this.chatId] || []
            const messages = await buildPrompt({
                preset, character,
                userPersona: settings.userPersona,
                virtualNow: timeService.now(),
                history,
                apiConfig: settings.apiConfig,
                chatId: this.chatId,
            })

            const result = await callChatCompletion(
                settings.apiConfig.primary,
                settings.apiConfig,
                messages,
                {
                    signal: this.abortController.signal,
                    debugPurpose: 'im_chat',
                    debugCharacterName: character.name,
                    debugEndpointName: 'primary',
                },
            )

            this.awaitingResponse = false
            this.abortController = null

            if (!result.ok) {
                this.notify()
                return { ok: false, error: result.error }
            }

            const parsed = parseReply(result.content)
            if (parsed.messages.length === 0) {
                this.notify()
                return { ok: true }
            }

            // 防复读：模型在低信息量输入（如用户只发了个表情）时，偶尔会把上一批回复原样再发一遍。
            // 若这一批与历史中紧邻的上一批 assistant 消息内容完全一致，则丢弃（对话不前进，等用户给新内容）。
            if (isDuplicateOfLastAssistantBatch(this.chatId, parsed.messages)) {
                console.log('[scheduler] 检测到与上一批 assistant 回复完全重复，已丢弃防复读')
                this.notify()
                return { ok: true }
            }

            this.assistantQueue = parsed.messages.map((m) => ({
                type: m.type, content: m.content, imagePrompt: m.imagePrompt,
                mood: parsed.mood, sceneHint: parsed.sceneHint ?? null,
            }))
            this.currentBatchId = uuid()   // 这一批用同一个 batchId
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
            if (e?.name === 'AbortError') {
                this.notify()
                return { ok: false, error: '已取消' }
            }
            this.notify()
            return { ok: false, error: e?.message || String(e) }
        }
    }

    private async deliverNext(): Promise<void> {
        if (this.assistantQueue.length === 0) {
            this.currentBatchId = null
            this.notify()
            return
        }

        const item = this.assistantQueue.shift()!
        const batchId = this.currentBatchId || uuid()

        // 图片消息：分发时实时出图（耗时操作）；失败降级为文字描述
        if (item.type === 'image' && item.imagePrompt) {
            let imageData: string | undefined
            if (isImageGenAvailable()) {
                try {
                    // 可选：用辅助模型把描述改写成规范英文提示词（promptGenEnabled 开启时；否则原样返回）
                    const finalPrompt = await refineImagePrompt(item.imagePrompt)
                    const gen = await generateImage(finalPrompt)
                    if (gen.ok && gen.image) imageData = gen.image
                    else console.warn('[scheduler] 聊天配图生成失败：', gen.error)
                } catch (e) {
                    console.warn('[scheduler] 聊天配图生成异常：', e)
                }
            }
            if (imageData) {
                await useChatStore.getState().appendAssistantMessageWithBatch(
                    this.chatId,
                    { type: 'image', content: item.content, mood: item.mood, sceneHint: item.sceneHint, imageData },
                    batchId,
                )
            } else {
                // 出图失败：以文字形式兜底（保留描述，对话不中断）
                await useChatStore.getState().appendAssistantMessageWithBatch(
                    this.chatId,
                    { type: 'text', content: item.content, mood: item.mood, sceneHint: item.sceneHint },
                    batchId,
                )
            }
        } else {
            await useChatStore.getState().appendAssistantMessageWithBatch(this.chatId, item, batchId)
        }

        if (this.assistantQueue.length === 0) {
            this.currentBatchId = null
            this.notify()
            return
        }

        const settings = useSettingsStore.getState().settings
        const cb = settings?.chatBehavior
        const next = this.assistantQueue[0]
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

    private cancelAssistantDelivery(): void {
        if (this.deliveryTimer) {
            clearTimeout(this.deliveryTimer)
            this.deliveryTimer = null
        }
        if (this.assistantQueue.length > 0) {
            console.log(`[scheduler] 中断分发，丢弃 ${this.assistantQueue.length} 条未发出消息`)
            this.assistantQueue = []
        }
        this.currentBatchId = null
    }

    private cancelInflightRequest(): void {
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

/**
 * 判断"本批解析出的消息"是否与该会话历史里【紧邻的上一批 assistant 消息】内容完全相同。
 * 用于拦截模型在低信息量输入时的复读退化。逐条比对 type+content，全等才算重复。
 */
function isDuplicateOfLastAssistantBatch(
    chatId: string,
    newMessages: Array<{ type: string; content: string }>,
): boolean {
    if (newMessages.length === 0) return false
    const history = useChatStore.getState().messagesByChat[chatId] || []
    // 从末尾取出连续的一段 assistant 消息（跳过末尾可能的非 assistant）
    const lastBatch: Array<{ type: string; content: string }> = []
    for (let i = history.length - 1; i >= 0; i--) {
        const m = history[i]
        if (m.role !== 'assistant') {
            if (lastBatch.length > 0) break
            continue
        }
        if (m.type !== 'text' && m.type !== 'sticker' && m.type !== 'image') break
        lastBatch.unshift({ type: m.type, content: m.content })
    }
    if (lastBatch.length !== newMessages.length) return false
    for (let i = 0; i < newMessages.length; i++) {
        if (lastBatch[i].type !== newMessages[i].type) return false
        if (lastBatch[i].content.trim() !== newMessages[i].content.trim()) return false
    }
    return true
}

function pickPreset(character: Character, mode: 'im' | 'scene'): Preset | undefined {
    const settings = useSettingsStore.getState().settings
    const presets = usePresetStore.getState().presets
    const targetId = mode === 'im'
        ? (character.imPresetId || settings?.defaultImPresetId)
        : (character.scenePresetId || settings?.defaultScenePresetId)
    if (targetId) {
        const found = presets.find((p) => p.id === targetId)
        if (found) return found
    }
    return presets.find((p) => p.mode === mode)
}

const schedulers = new Map<string, ChatScheduler>()

export function getScheduler(chatId: string, characterId: string): ChatScheduler {
    let s = schedulers.get(chatId)
    if (!s) {
        s = new ChatScheduler(chatId, characterId)
        schedulers.set(chatId, s)
    }
    return s
}

export function disposeScheduler(chatId: string): void {
    const s = schedulers.get(chatId)
    if (s) {
        s.destroy()
        schedulers.delete(chatId)
    }
}
