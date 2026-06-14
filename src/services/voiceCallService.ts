import { buildPrompt } from './promptBuilder'
import { callChatCompletion } from './apiService'
import { parseReply } from './replyParser'
import { useChatStore } from '../stores/chatStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useCharacterStore } from '../stores/characterStore'
import { usePresetStore } from '../stores/presetStore'
import { timeService } from './timeService'
import type { ApiEndpoint, Character, Preset } from '../types'

/** 取该角色的 IM 预设（复刻 messageScheduler.pickPreset 的逻辑） */
function pickImPreset(character: Character): Preset | undefined {
  const settings = useSettingsStore.getState().settings
  const presets = usePresetStore.getState().presets
  const targetId = character.imPresetId || settings?.defaultImPresetId
  if (targetId) {
    const found = presets.find((p) => p.id === targetId)
    if (found) return found
  }
  return presets.find((p) => p.mode === 'im')
}

/**
 * 取语音用的 API 端点。
 * 端点来源按 voiceConfig.endpointSource：custom=独立语音端点 / utility=辅助 / primary=主。
 * 兼容旧字段 useUtilityEndpoint。STT/TTS 只需 baseUrl+apiKey，模型走 voiceConfig.sttModel/ttsModel。
 */
export function pickVoiceEndpoint(): { baseUrl: string; apiKey: string; model: string } | null {
  const settings = useSettingsStore.getState().settings
  if (!settings) return null
  const cfg = settings.voiceConfig
  // 端点来源：优先用新字段 endpointSource，旧数据回退 useUtilityEndpoint
  const source: 'primary' | 'utility' | 'custom' =
    cfg?.endpointSource ?? (cfg?.useUtilityEndpoint ? 'utility' : 'primary')

  if (source === 'custom') {
    if (cfg?.voiceBaseUrl && cfg?.voiceApiKey) {
      return { baseUrl: cfg.voiceBaseUrl, apiKey: cfg.voiceApiKey, model: '' }
    }
    // 独立端点没填全 → 回退主端点兜底
  }
  if (source === 'utility') {
    const u = settings.apiConfig.utility
    if (u.apiKey && u.baseUrl) return u
  }
  const p = settings.apiConfig.primary
  if (p.apiKey && p.baseUrl) return p
  return null
}

/**
 * 通话每轮：把用户的 STT 文字当作输入走聊天链路拿到 AI 文字回复。
 * - 复用人设/世界书/记忆（buildPrompt）
 * - 把用户话和 AI 回复 append 成普通 text 消息存进该 chat（通话与文字聊天共享上下文）
 * - 解析多条消息后合并成一段连贯文本（通话语境下不需要逐条气泡），供 TTS 播放
 *
 * @returns AI 回复纯文本；失败返回 { ok:false, error }
 */
export async function runVoiceTurn(
  chatId: string,
  characterId: string,
  userText: string,
  signal?: AbortSignal,
): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
  const trimmed = userText.trim()
  if (!trimmed) return { ok: false, error: '没有识别到内容' }

  const settings = useSettingsStore.getState().settings
  if (!settings) return { ok: false, error: '设置未加载' }
  const character = useCharacterStore.getState().getById(characterId)
  if (!character) return { ok: false, error: '角色不存在' }
  const preset = pickImPreset(character)
  if (!preset) return { ok: false, error: '没有可用的微信预设' }

  // 先把用户这句话写进历史（与文字聊天共享上下文）
  await useChatStore.getState().appendUserMessage(chatId, trimmed)

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
    {
      signal,
      debugPurpose: 'im_chat',
      debugCharacterName: character.name,
      debugEndpointName: 'primary',
    },
  )

  if (!result.ok) return { ok: false, error: result.error }

  // 解析成多条消息（含表情/图片描述），通话里只取文本拼接
  const parsed = parseReply(result.content)
  const textParts = parsed.messages
    .filter((m) => m.type === 'text')
    .map((m) => m.content.trim())
    .filter(Boolean)
  const reply = textParts.join('，')

  // 把 AI 回复也写进历史（合并成一条 text 消息，保持上下文连续）
  if (reply) {
    await useChatStore.getState().appendAssistantMessages(chatId, [{ type: 'text', content: reply }])
  }

  if (!reply) return { ok: false, error: '对方没有可朗读的回复' }
  return { ok: true, reply }
}

/** 把一段回复按中文标点切句，供边收边播逐句 TTS */
export function splitIntoSentences(text: string): string[] {
  const parts = text
    .split(/(?<=[。！？；…\n!?;])/)
    .map((s) => s.trim())
    .filter(Boolean)
  // 合并过短的碎句，避免一字一合成
  const out: string[] = []
  for (const p of parts) {
    if (out.length && (out[out.length - 1].length < 6 || p.length < 6)) {
      out[out.length - 1] += p
    } else {
      out.push(p)
    }
  }
  return out.length ? out : [text]
}