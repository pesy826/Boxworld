import { buildPrompt } from './promptBuilder'
import { callChatCompletion } from './apiService'
import { parseReply } from './replyParser'
import { useChatStore } from '../stores/chatStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useCharacterStore } from '../stores/characterStore'
import { usePresetStore } from '../stores/presetStore'
import { timeService } from './timeService'
import type { Character, Preset } from '../types'

export interface SendResult {
    ok: boolean
    error?: string
}

/**
 * 重新生成某条 AI 消息所在 batch 的回复。
 */
export async function regenerateBatch(
    chatId: string,
    characterId: string,
    batchId: string,
    options?: { signal?: AbortSignal },
): Promise<SendResult> {
    const settings = useSettingsStore.getState().settings
    if (!settings) return { ok: false, error: '设置未加载' }

    const character = useCharacterStore.getState().getById(characterId)
    if (!character) return { ok: false, error: '角色不存在' }

    const preset = pickPreset(character, 'im')
    if (!preset) return { ok: false, error: '没有可用的微信预设' }

    await useChatStore.getState().deleteBatch(chatId, batchId)

    const history = useChatStore.getState().messagesByChat[chatId] || []

    const messages = await buildPrompt({
        preset,
        character,
        userPersona: settings.userPersona,
        virtualNow: timeService.now(),
        history,
        apiConfig: settings.apiConfig,
        chatId,
    })


    const result = await callChatCompletion(
        settings.apiConfig.primary,
        settings.apiConfig,
        messages,
        { signal: options?.signal },
    )
    if (!result.ok) return { ok: false, error: result.error }

    const parsed = parseReply(result.content)
    if (parsed.messages.length === 0) {
        return { ok: true }
    }

    await useChatStore.getState().appendAssistantMessages(
        chatId,
        parsed.messages.map((m) => ({
            type: m.type,
            content: m.content,
            mood: parsed.mood,
            sceneHint: parsed.sceneHint ?? null,
        })),
    )

    return { ok: true }
}

const greetingInFlight = new Set<string>()

export async function sendGreetingIfNeeded(chatId: string, characterId: string): Promise<void> {
    if (greetingInFlight.has(chatId)) return
    greetingInFlight.add(chatId)

    try {
        const { db } = await import('../db')
        const existingCount = await db.messages.where('chatId').equals(chatId).count()
        if (existingCount > 0) return

        const character = useCharacterStore.getState().getById(characterId)
        if (!character) return

        const greetingText = character.imFirstMes?.trim() || character.firstMes?.trim()
        if (!greetingText) return

        const lines = greetingText.split('\n').map((s) => s.trim()).filter(Boolean)
        await useChatStore.getState().appendAssistantMessages(
            chatId,
            lines.map((content) => ({ type: 'text' as const, content })),
        )
    } finally {
        // 保持锁定
    }
}

export function resetGreetingFlag(chatId: string) {
    greetingInFlight.delete(chatId)
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
