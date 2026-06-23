/**
 * 文字消息「转语音」服务。
 *
 * 复用语音通话的同一套配置/端点（voiceConfig + pickVoiceEndpoint + ttsModel/ttsVoice），
 * 调用 apiService.synthesizeSpeech 合成音频。
 *
 * 交互：在文字消息上点「转语音」→ 合成音频存进该消息（message.voiceData/voiceDuration，持久化）→
 * 气泡下方挂一个语音条（不影响原文本显示）。点击语音条播放/暂停。
 */
import { synthesizeSpeech } from './apiService'
import { pickVoiceEndpoint } from './voiceCallService'
import { useSettingsStore } from '../stores/settingsStore'
import { useChatStore } from '../stores/chatStore'

/** 语音朗读是否可用（语音通话已启用 + 有可用端点） */
export function isTtsAvailable(): boolean {
  const cfg = useSettingsStore.getState().settings?.voiceConfig
  if (!cfg?.enabled) return false
  return !!pickVoiceEndpoint()
}

/**
 * 给某条文字消息生成语音并挂上（写进 message.voiceData/voiceDuration）。
 * 已经有语音的消息直接返回成功（不重复合成）。
 */
export async function generateMessageVoice(
  messageId: string,
  text: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const content = (text || '').trim()
  if (!content) return { ok: false, error: '没有可朗读的内容' }

  const cfg = useSettingsStore.getState().settings?.voiceConfig
  if (!cfg?.enabled) return { ok: false, error: '语音通话未启用（转语音复用其配置）' }
  const endpoint = pickVoiceEndpoint()
  if (!endpoint) return { ok: false, error: '未配置可用的语音端点' }

  try {
    const r = await synthesizeSpeech(
      { ...endpoint, model: cfg.ttsModel },
      content,
      { model: cfg.ttsModel, voice: cfg.ttsVoice },
    )
    if (!r.ok) return { ok: false, error: r.error }

    const { dataUrl, duration } = await blobToDataUrlWithDuration(r.blob)
    await useChatStore.getState().setMessageVoice(messageId, dataUrl, duration)
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}

// ============ 播放控制（单例 + 状态订阅，供语音条显示播放中） ============

let currentAudio: HTMLAudioElement | null = null
let playingId: string | null = null
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((l) => l())
}

/** 订阅播放状态变化（返回取消订阅函数） */
export function subscribeVoicePlay(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 当前正在播放的消息 id（没有则 null） */
export function getPlayingVoiceId(): string | null {
  return playingId
}

/** 停止当前播放 */
export function stopVoicePlay() {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
  if (playingId !== null) {
    playingId = null
    notify()
  }
}

/**
 * 播放/暂停某条消息的语音条。再次点正在播的同一条 = 停止。
 */
export function toggleVoicePlay(messageId: string, voiceData: string) {
  if (playingId === messageId) {
    stopVoicePlay()
    return
  }
  stopVoicePlay()
  const audio = new Audio(voiceData)
  currentAudio = audio
  playingId = messageId
  notify()
  audio.onended = () => {
    if (playingId === messageId) { playingId = null; notify() }
    if (currentAudio === audio) currentAudio = null
  }
  audio.onerror = () => {
    if (playingId === messageId) { playingId = null; notify() }
  }
  audio.play().catch(() => {
    if (playingId === messageId) { playingId = null; notify() }
  })
}

/** Blob → { dataURL, 时长秒（向上取整，至少 1） } */
async function blobToDataUrlWithDuration(blob: Blob): Promise<{ dataUrl: string; duration: number }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })

  // 用 audio 元素探测时长（metadata）；失败兜底按文本长度估算
  const duration = await new Promise<number>((resolve) => {
    try {
      const url = URL.createObjectURL(blob)
      const audio = new Audio()
      const done = (d: number) => { URL.revokeObjectURL(url); resolve(d) }
      audio.onloadedmetadata = () => {
        const d = audio.duration
        done(Number.isFinite(d) && d > 0 ? Math.max(1, Math.ceil(d)) : 1)
      }
      audio.onerror = () => done(1)
      audio.src = url
    } catch {
      resolve(1)
    }
  })

  return { dataUrl, duration }
}