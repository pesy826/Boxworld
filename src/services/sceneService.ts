import { buildPrompt } from './promptBuilder'
import { callChatCompletion, callChatCompletionStream } from './apiService'
import { useChatStore } from '../stores/chatStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useCharacterStore } from '../stores/characterStore'
import { usePresetStore } from '../stores/presetStore'
import { timeService } from './timeService'
import { advanceCharacterTime } from './soloModeService'
import { parseTimeAdvance } from '../utils/timeParse'
import type { Character, Preset } from '../types'

export interface SceneSendResult {
  ok: boolean
  error?: string
  /** 本次因用户输入推进的时间（毫秒），0 表示没推进 */
  advancedMs?: number
}

export interface SceneSendOptions {
  onDelta?: (accumulated: string) => void
  signal?: AbortSignal
}

export async function sendSceneMessage(
  chatId: string,
  characterId: string,
  text: string,
  options?: SceneSendOptions,
): Promise<SceneSendResult> {
  const settings = useSettingsStore.getState().settings
  if (!settings) return { ok: false, error: '设置未加载' }

  const character = useCharacterStore.getState().getById(characterId)
  if (!character) return { ok: false, error: '角色不存在' }

  const preset = pickScenePreset(character)
  if (!preset) return { ok: false, error: '没有可用的场景预设' }

  // 1. 解析用户输入里的时间推进意图，先推进卡时间（这样 prompt 的 datetime 是新时间）
  let advancedMs = 0
  const parsed = parseTimeAdvance(text)
  if (parsed.advanceMs > 0 && character.soloModeEntered) {
    await advanceCharacterTime(characterId, parsed.advanceMs)
    advancedMs = parsed.advanceMs
  }

  // 2. 入库用户叙事
  await useChatStore.getState().appendUserSceneNarrative(chatId, text)

  // 3. 构 prompt + 调 API（此时 character 已更新，但要重新取最新的）
  const freshChar = useCharacterStore.getState().getById(characterId) || character
  const history = useChatStore.getState().messagesByChat[chatId] || []
  const messages = await buildPrompt({
    preset,
    character: freshChar,
    userPersona: settings.userPersona,
    virtualNow: timeService.nowForCharacter(freshChar),
    history,
    apiConfig: settings.apiConfig,
    chatId,
  })

  const content = await runGeneration(settings, messages, character.name, options)
  if (!content.ok) return { ok: false, error: content.error }

  const text2 = content.text.trim()
  if (!text2) return { ok: false, error: '模型返回为空' }

  await useChatStore.getState().appendAssistantSceneNarrative(chatId, text2)
  return { ok: true, advancedMs }
}

export async function regenerateSceneMessage(
  chatId: string,
  characterId: string,
  messageId: string,
  options?: SceneSendOptions,
): Promise<SceneSendResult> {
  const settings = useSettingsStore.getState().settings
  if (!settings) return { ok: false, error: '设置未加载' }

  const character = useCharacterStore.getState().getById(characterId)
  if (!character) return { ok: false, error: '角色不存在' }

  const preset = pickScenePreset(character)
  if (!preset) return { ok: false, error: '没有可用的场景预设' }

  await useChatStore.getState().deleteMessage(chatId, messageId)

  const history = useChatStore.getState().messagesByChat[chatId] || []
  const messages = await buildPrompt({
    preset,
    character,
    userPersona: settings.userPersona,
    virtualNow: timeService.nowForCharacter(character),
    history,
    apiConfig: settings.apiConfig,
    chatId,
  })

  const content = await runGeneration(settings, messages, character.name, options)
  if (!content.ok) return { ok: false, error: content.error }

  const text2 = content.text.trim()
  if (!text2) return { ok: false, error: '模型返回为空' }

  await useChatStore.getState().appendAssistantSceneNarrative(chatId, text2)
  return { ok: true }
}

async function runGeneration(
  settings: NonNullable<ReturnType<typeof useSettingsStore.getState>['settings']>,
  messages: any[],
  characterName: string,
  options?: SceneSendOptions,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const useStream = settings.apiConfig.stream && !!options?.onDelta

  if (useStream) {
    const r = await callChatCompletionStream(
      settings.apiConfig.primary,
      settings.apiConfig,
      messages,
      (_delta, accumulated) => { options!.onDelta!(accumulated) },
      {
        signal: options?.signal,
        debugPurpose: 'scene_chat',
        debugCharacterName: characterName,
        debugEndpointName: 'primary',
      },
    )
    if (!r.ok) {
      console.warn('[scene] 流式失败，回退非流式:', r.error)
      const r2 = await callChatCompletion(
        settings.apiConfig.primary, settings.apiConfig, messages,
        { signal: options?.signal, debugPurpose: 'scene_chat', debugCharacterName: characterName, debugEndpointName: 'primary' },
      )
      return r2.ok ? { ok: true, text: r2.content } : { ok: false, error: r2.error }
    }
    return { ok: true, text: r.content }
  }

  const r = await callChatCompletion(
    settings.apiConfig.primary, settings.apiConfig, messages,
    { signal: options?.signal, debugPurpose: 'scene_chat', debugCharacterName: characterName, debugEndpointName: 'primary' },
  )
  return r.ok ? { ok: true, text: r.content } : { ok: false, error: r.error }
}

function pickScenePreset(character: Character): Preset | undefined {
  const settings = useSettingsStore.getState().settings
  const presets = usePresetStore.getState().presets
  const targetId = character.scenePresetId || settings?.defaultScenePresetId
  if (targetId) {
    const found = presets.find((p) => p.id === targetId)
    if (found) return found
  }
  return presets.find((p) => p.mode === 'scene')
}
