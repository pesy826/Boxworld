import { Image as ImageIcon, Phone, Camera, Video, MapPin, Gift, Wallet, CreditCard } from 'lucide-react'

interface PlusPanelProps {
  /** 选图片（相册） */
  onPickImage: () => void
  /** 发起语音通话；未启用时为 undefined → 该项灰显 */
  onVoiceCall?: () => void
  /** 语音通话是否启用（设置里开了才亮） */
  voiceEnabled?: boolean
}

interface GridItem {
  key: string
  label: string
  icon: React.ReactNode
  onClick?: () => void
  disabled?: boolean
}

/** 仿微信「+」九宫格面板。可用项：相册、语音通话；其余留灰禁用占位。 */
export default function PlusPanel({ onPickImage, onVoiceCall, voiceEnabled }: PlusPanelProps) {
  const items: GridItem[] = [
    { key: 'album', label: '相册', icon: <ImageIcon size={26} />, onClick: onPickImage },
    {
      key: 'voice',
      label: '语音通话',
      icon: <Phone size={26} />,
      onClick: voiceEnabled ? onVoiceCall : undefined,
      disabled: !voiceEnabled,
    },
    { key: 'camera', label: '拍摄', icon: <Camera size={26} />, disabled: true },
    { key: 'video', label: '视频通话', icon: <Video size={26} />, disabled: true },
    { key: 'location', label: '位置', icon: <MapPin size={26} />, disabled: true },
    { key: 'redpacket', label: '红包', icon: <Gift size={26} />, disabled: true },
    { key: 'transfer', label: '转账', icon: <CreditCard size={26} />, disabled: true },
    { key: 'gift', label: '礼物', icon: <Wallet size={26} />, disabled: true },
  ]

  return (
    <div className="bg-wechat-nav border-t border-wechat-divider px-4 py-4 pb-safe">
      <div className="grid grid-cols-4 gap-3">
        {items.map((it) => (
          <button
            key={it.key}
            onClick={it.onClick}
            disabled={it.disabled || !it.onClick}
            className="flex flex-col items-center gap-1.5"
          >
            <div
              className={`w-14 h-14 rounded-xl bg-white flex items-center justify-center ${
                it.disabled || !it.onClick ? 'text-gray-300' : 'text-wechat-textGray'
              }`}
            >
              {it.icon}
            </div>
            <span className={`text-[11px] ${it.disabled || !it.onClick ? 'text-gray-300' : 'text-wechat-textGray'}`}>
              {it.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}