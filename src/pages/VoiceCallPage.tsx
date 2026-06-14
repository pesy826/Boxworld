import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PhoneOff, Mic, MicOff } from 'lucide-react'
import Avatar from '../components/Avatar'
import { useChatStore } from '../stores/chatStore'
import { useCharacterStore } from '../stores/characterStore'
import { useSettingsStore } from '../stores/settingsStore'
import { transcribeAudio, synthesizeSpeech } from '../services/apiService'
import { runVoiceTurn, splitIntoSentences, pickVoiceEndpoint } from '../services/voiceCallService'
import { createDefaultVoiceConfig } from '../db/defaults'

type CallState = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking'

const STATE_TEXT: Record<CallState, string> = {
  idle: '准备中…',
  listening: '正在聆听…',
  transcribing: '识别中…',
  thinking: '对方正在思考…',
  speaking: '对方正在说话…',
}

export default function VoiceCallPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const chat = useChatStore((s) => s.chats.find((c) => c.id === id))
  const character = useCharacterStore((s) => (chat ? s.getById(chat.characterId) : undefined))
  const settings = useSettingsStore((s) => s.settings)

  const [callState, setCallState] = useState<CallState>('idle')
  const [muted, setMuted] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [lastUser, setLastUser] = useState('')
  const [lastReply, setLastReply] = useState('')

  // —— 运行时引用（不触发渲染）——
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const rafRef = useRef<number | null>(null)
  const playingAudioRef = useRef<HTMLAudioElement | null>(null)
  const ttsQueueRef = useRef<string[]>([])
  const ttsPlayingRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const endedRef = useRef(false)
  const callStateRef = useRef<CallState>('idle')
  const mutedRef = useRef(false)

  // VAD 状态
  const speakingRef = useRef(false)        // 当前是否检测到在说话
  const silenceStartRef = useRef(0)        // 静音开始时刻
  const hadSpeechRef = useRef(false)       // 本段是否出现过有效语音

  const cfg = settings?.voiceConfig || createDefaultVoiceConfig()
  const vadSilenceMs = cfg.vadSilenceMs ?? 800
  const vadEnabled = cfg.vadEnabled !== false

  const setState = (s: CallState) => {
    callStateRef.current = s
    setCallState(s)
  }

  useEffect(() => { mutedRef.current = muted }, [muted])

  // 通话计时
  useEffect(() => {
    const t = window.setInterval(() => setSeconds((v) => v + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // —— 停止所有播放 ——
  const stopPlayback = useCallback(() => {
    ttsQueueRef.current = []
    ttsPlayingRef.current = false
    if (playingAudioRef.current) {
      try { playingAudioRef.current.pause() } catch { /* noop */ }
      playingAudioRef.current = null
    }
  }, [])

  // —— 逐句 TTS 播放队列 ——
  const playNextTts = useCallback(async () => {
    if (ttsPlayingRef.current) return
    const next = ttsQueueRef.current.shift()
    if (!next) {
      // 队列空了：若不在思考/识别中，回到聆听
      if (!endedRef.current && callStateRef.current === 'speaking') {
        startListening()
      }
      return
    }
    const ep = pickVoiceEndpoint()
    if (!ep) return
    ttsPlayingRef.current = true
    try {
      const r = await synthesizeSpeech(ep, next, { model: cfg.ttsModel, voice: cfg.ttsVoice })
      if (endedRef.current) { ttsPlayingRef.current = false; return }
      if (!r.ok) {
        ttsPlayingRef.current = false
        playNextTts()
        return
      }
      const url = URL.createObjectURL(r.blob)
      const audio = new Audio(url)
      playingAudioRef.current = audio
      audio.onended = () => {
        URL.revokeObjectURL(url)
        playingAudioRef.current = null
        ttsPlayingRef.current = false
        playNextTts()
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        playingAudioRef.current = null
        ttsPlayingRef.current = false
        playNextTts()
      }
      await audio.play().catch(() => {
        ttsPlayingRef.current = false
        playNextTts()
      })
    } catch {
      ttsPlayingRef.current = false
      playNextTts()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.ttsModel, cfg.ttsVoice])

  const enqueueTts = useCallback((sentences: string[]) => {
    ttsQueueRef.current.push(...sentences)
    playNextTts()
  }, [playNextTts])

  // —— 处理一段录音：STT → LLM → TTS ——
  const processSegment = useCallback(async (blob: Blob) => {
    if (endedRef.current || !chat || !character) return
    const ep = pickVoiceEndpoint()
    if (!ep) { setError('未配置可用的 API 端点'); return }

    setState('transcribing')
    abortRef.current = new AbortController()
    const stt = await transcribeAudio(ep, blob, { model: cfg.sttModel, language: cfg.sttLanguage, signal: abortRef.current.signal })
    if (endedRef.current) return
    if (!stt.ok || !stt.text.trim()) {
      // 没识别到内容，回到聆听
      if (!stt.ok) setError(`识别失败：${stt.error}`)
      startListening()
      return
    }
    setLastUser(stt.text)
    setError(null)

    setState('thinking')
    const turn = await runVoiceTurn(chat.id, character.id, stt.text, abortRef.current.signal)
    if (endedRef.current) return
    if (!turn.ok) {
      setError(turn.error)
      startListening()
      return
    }
    setLastReply(turn.reply)
    setState('speaking')
    enqueueTts(splitIntoSentences(turn.reply))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat, character, cfg.sttModel, cfg.sttLanguage, enqueueTts])

  // —— 开始一段录音（聆听）——
  const startListening = useCallback(() => {
    if (endedRef.current) return
    const stream = streamRef.current
    if (!stream) return
    setState('listening')
    chunksRef.current = []
    hadSpeechRef.current = false
    speakingRef.current = false
    silenceStartRef.current = 0

    const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
      : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : ''
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    recorderRef.current = rec
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' })
      // 只有出现过有效语音且有数据才处理
      if (hadSpeechRef.current && blob.size > 1000) {
        processSegment(blob)
      } else if (!endedRef.current) {
        // 空段，重新聆听
        startListening()
      }
    }
    rec.start(200)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processSegment])

  // —— 停止当前录音段（触发 onstop → processSegment）——
  const finishListening = useCallback(() => {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') {
      try { rec.stop() } catch { /* noop */ }
    }
    recorderRef.current = null
  }, [])

  // —— VAD 主循环（能量阈值）——
  const vadLoop = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser || endedRef.current) return
    const buf = new Uint8Array(analyser.fftSize)
    analyser.getByteTimeDomainData(buf)
    let sum = 0
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128
      sum += v * v
    }
    const rms = Math.sqrt(sum / buf.length)
    const now = performance.now()
    const THRESHOLD = 0.04   // 能量阈值（可按需调）

    const state = callStateRef.current

    // 说话时检测到用户开口 → 打断 AI（仿真实通话插话）
    if (state === 'speaking' && rms > THRESHOLD * 1.5 && !mutedRef.current) {
      stopPlayback()
      startListening()
    }

    // 聆听中做 VAD 断句
    if (state === 'listening' && !mutedRef.current) {
      if (rms > THRESHOLD) {
        speakingRef.current = true
        hadSpeechRef.current = true
        silenceStartRef.current = 0
      } else if (speakingRef.current) {
        // 之前在说话，现在静音
        if (silenceStartRef.current === 0) silenceStartRef.current = now
        else if (vadEnabled && now - silenceStartRef.current > vadSilenceMs) {
          // 静音足够久 → 本句说完
          speakingRef.current = false
          finishListening()
        }
      }
    }

    rafRef.current = requestAnimationFrame(vadLoop)
  }, [stopPlayback, startListening, finishListening, vadEnabled, vadSilenceMs])

  // —— 挂断 ——
  // 注意：不能 await 任何可能挂起的操作（如 getUserMedia 卡住时 audioCtx.close 也可能不返回），
  // 否则点挂断没反应。先同步清理 + 立即跳转离开页面，记录写入放到后台不阻塞。
  const hangUp = useCallback(() => {
    if (endedRef.current) return
    endedRef.current = true
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (abortRef.current) { try { abortRef.current.abort() } catch { /* noop */ } }
    stopPlayback()
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') { try { rec.stop() } catch { /* noop */ } }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    // 不 await，避免卡死挂断
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}) }
    // 通话结束在聊天里留一条记录（后台写，不阻塞跳转）
    if (chat) {
      const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
      const ss = String(seconds % 60).padStart(2, '0')
      useChatStore.getState().appendSystemNotice(chat.id, `通话时长 ${mm}:${ss}`).catch(() => {})
    }
    // 显式回到该聊天页；history 为空时 navigate(-1) 不生效，用确定的目标路由兜底
    if (chat) navigate(`/chat/${chat.id}`, { replace: true })
    else navigate('/', { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat, seconds, navigate, stopPlayback])

  // —— 开始通话（用户手势触发，已在进入页面时）——
  const startCall = useCallback(async () => {
    setError(null)
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('当前环境不支持麦克风录音')
      }
      // getUserMedia 在权限未授予时可能一直挂起（桌面 WebView 常见）→ 加超时兜底
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({ audio: true }),
        new Promise<MediaStream>((_, reject) =>
          setTimeout(() => reject(new Error('获取麦克风超时，请检查系统/应用的麦克风权限')), 10000),
        ),
      ])
      if (endedRef.current) { stream.getTracks().forEach((t) => t.stop()); return }
      streamRef.current = stream
      const AC = window.AudioContext || (window as any).webkitAudioContext
      const ctx = new AC()
      audioCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      source.connect(analyser)
      analyserRef.current = analyser
      rafRef.current = requestAnimationFrame(vadLoop)
      startListening()
    } catch (e: any) {
      setError('无法获取麦克风：' + (e?.message || e))
      setState('idle')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vadLoop, startListening])

  useEffect(() => {
    // 进入页面即开始（页面是用户点击「语音通话」跳转来的，算用户手势）
    startCall()
    return () => {
      endedRef.current = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (abortRef.current) { try { abortRef.current.abort() } catch { /* noop */ } }
      stopPlayback()
      const rec = recorderRef.current
      if (rec && rec.state !== 'inactive') { try { rec.stop() } catch { /* noop */ } }
      streamRef.current?.getTracks().forEach((t) => t.stop())
      if (audioCtxRef.current) { try { audioCtxRef.current.close() } catch { /* noop */ } }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!chat || !character) {
    return (
      <div className="fixed inset-0 z-50 bg-gradient-to-b from-slate-800 to-slate-900 text-white flex flex-col items-center justify-center">
        <div className="text-[15px]">会话不存在</div>
        <button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 bg-white/20 rounded">返回</button>
      </div>
    )
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-slate-700 to-slate-900 text-white flex flex-col items-center pt-[18vh] pb-16 px-6">
      <Avatar src={character.avatar} name={character.name} size={96} />
      <div className="mt-4 text-[22px] font-medium">{character.name}</div>
      <div className="mt-2 text-[14px] text-white/70">{STATE_TEXT[callState]}</div>
      <div className="mt-1 text-[13px] text-white/50">{mm}:{ss}</div>

      {error && (
        <div className="mt-4 text-[12px] text-red-300 bg-red-900/30 px-3 py-1.5 rounded max-w-[280px] text-center">
          {error}
        </div>
      )}

      <div className="mt-6 w-full max-w-[300px] space-y-2 text-[13px] text-white/80">
        {lastUser && (
          <div className="bg-white/10 rounded-lg px-3 py-2">
            <span className="text-white/50">你：</span>{lastUser}
          </div>
        )}
        {lastReply && (
          <div className="bg-white/10 rounded-lg px-3 py-2">
            <span className="text-white/50">{character.name}：</span>{lastReply}
          </div>
        )}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-12">
        <button
          onClick={() => setMuted((v) => !v)}
          className="flex flex-col items-center gap-1.5"
        >
          <div className={`w-14 h-14 rounded-full flex items-center justify-center ${muted ? 'bg-white text-slate-800' : 'bg-white/20'}`}>
            {muted ? <MicOff size={24} /> : <Mic size={24} />}
          </div>
          <span className="text-[12px] text-white/70">{muted ? '已静音' : '静音'}</span>
        </button>

        <button onClick={hangUp} className="flex flex-col items-center gap-1.5">
          <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center">
            <PhoneOff size={28} />
          </div>
          <span className="text-[12px] text-white/70">挂断</span>
        </button>
      </div>

      {vadEnabled && (
        <div className="mt-4 text-[11px] text-white/40">检测到停顿自动断句；说话可打断对方</div>
      )}
    </div>
  )
}