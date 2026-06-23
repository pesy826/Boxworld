import { useEffect, useState } from 'react'
import { Volume2 } from 'lucide-react'
import { toggleVoicePlay, getPlayingVoiceId, subscribeVoicePlay } from '../services/ttsService'

/**
 * 挂在文字消息气泡下方的语音条（微信风格）。
 * 点击播放/暂停；显示时长 N″ + 喇叭图标，播放中喇叭高亮。
 *
 * @param messageId 关联的消息 id（播放单例 + 高亮判断）
 * @param voiceData 音频 dataURL
 * @param duration 时长秒
 * @param isUser 用户侧（右对齐绿底）/ 角色侧（左对齐白底），样式跟随气泡
 */
export default function VoiceBar({
  messageId, voiceData, duration, isUser,
}: {
  messageId: string
  voiceData: string
  duration?: number
  isUser?: boolean
}) {
  const [playing, setPlaying] = useState(getPlayingVoiceId() === messageId)

  useEffect(() => {
    const unsub = subscribeVoicePlay(() => setPlaying(getPlayingVoiceId() === messageId))
    return unsub
  }, [messageId])

  const secs = Math.max(1, duration || 1)
  // 时长越长条越宽（微信观感），限定范围
  const width = Math.min(160, 56 + secs * 6)

  return (
    <button
      onClick={() => toggleVoicePlay(messageId, voiceData)}
      title={playing ? '点击停止' : '点击播放'}
      className={`mt-1 flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] select-none ${
        isUser ? 'bg-wechat-bubble' : 'bg-wechat-card border border-wechat-divider'
      }`}
      style={{ width, justifyContent: isUser ? 'flex-end' : 'flex-start' }}
    >
      {isUser ? (
        <>
          <span className="text-wechat-text">{secs}″</span>
          <Volume2 size={16} className={playing ? 'text-wechat-green animate-pulse' : 'text-wechat-text'} />
        </>
      ) : (
        <>
          <Volume2 size={16} className={playing ? 'text-wechat-green animate-pulse' : 'text-wechat-textGray'} />
          <span className="text-wechat-text">{secs}″</span>
        </>
      )}
    </button>
  )
}