import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Clock } from 'lucide-react'
import { useCharacterStore } from '../stores/characterStore'
import { advanceCharacterTime, setCharacterTime, enterSoloMode } from '../services/soloModeService'
import { useCharacterTime } from '../services/useVirtualTime'
import { formatFull } from '../utils/time'

/**
 * 单卡时间调整页。
 * 从通讯录单卡横幅的时间处点击进入，直接调整该角色世界的独立时间线。
 */
export default function SoloTimePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const character = useCharacterStore((s) => s.getById(id))
  const soloTime = useCharacterTime(id)
  const [setting, setSetting] = useState(false)
  const [tip, setTip] = useState<string | null>(null)

  if (!character) {
    return (
      <div className="min-h-full bg-wechat-bg flex flex-col">
        <header className="h-header-safe flex items-center px-2 bg-white border-b border-wechat-divider">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2">
            <ChevronLeft size={22} />
          </button>
          <h1 className="text-[17px] font-semibold flex-1 text-center">单卡时间</h1>
          <div className="w-9" />
        </header>
        <div className="flex-1 flex items-center justify-center text-wechat-textGray">
          角色不存在
        </div>
      </div>
    )
  }

  const isSolo = character.soloModeEntered

  const flashTip = (text: string) => {
    setTip(text)
    setTimeout(() => setTip(null), 2500)
  }

  const handleAdvance = async (deltaMs: number, label: string) => {
    if (!isSolo) {
      // 未启用独立时间线则先初始化（理论上从单卡横幅进来已是单卡，这里兜底）
      await enterSoloMode(character.id)
    }
    await advanceCharacterTime(character.id, deltaMs)
    flashTip(`已推进 ${label}`)
  }

  const handleSetExact = async () => {
    const input = prompt(
      '设置该角色世界的时间（格式 2026-06-15 18:00）：',
      new Date(soloTime).toLocaleString('zh-CN', { hour12: false }),
    )
    if (!input) return
    const ts = Date.parse(input.replace(/\//g, '-').trim())
    if (isNaN(ts)) {
      alert('时间格式不对')
      return
    }
    setSetting(true)
    if (!isSolo) await enterSoloMode(character.id)
    await setCharacterTime(character.id, ts)
    setSetting(false)
    flashTip('已设置时间')
  }

  const quick: Array<{ label: string; ms: number }> = [
    { label: '+30 分钟', ms: 30 * 60 * 1000 },
    { label: '+1 小时', ms: 60 * 60 * 1000 },
    { label: '+3 小时', ms: 3 * 60 * 60 * 1000 },
    { label: '+8 小时', ms: 8 * 60 * 60 * 1000 },
    { label: '+1 天', ms: 24 * 60 * 60 * 1000 },
    { label: '+3 天', ms: 3 * 24 * 60 * 60 * 1000 },
  ]
  const rewind: Array<{ label: string; ms: number }> = [
    { label: '-1 小时', ms: -60 * 60 * 1000 },
    { label: '-1 天', ms: -24 * 60 * 60 * 1000 },
  ]

  return (
    <div className="min-h-full bg-wechat-bg flex flex-col" data-tour="solo-time-page">
      <header className="h-header-safe flex items-center px-2 bg-white border-b border-wechat-divider">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-[17px] font-semibold flex-1 text-center">单卡时间 · {character.name}</h1>
        <div className="w-9" />
      </header>

      <div className="px-4 py-6">
        <div className="bg-white rounded-xl p-5 text-center">
          <Clock size={28} className="mx-auto text-amber-500 mb-2" />
          <div className="text-[12px] text-wechat-textGray">「{character.name}」世界当前时间</div>
          <div className="text-[20px] font-medium mt-1">{formatFull(soloTime)}</div>
          {!isSolo && (
            <div className="text-[11px] text-amber-600 mt-2">
              该角色尚未启用独立时间线，调整后将自动进入单卡时间
            </div>
          )}
        </div>

        <div className="mt-5 text-[12px] text-wechat-textGray mb-2">快进时间</div>
        <div className="grid grid-cols-3 gap-2">
          {quick.map((q) => (
            <button
              key={q.label}
              onClick={() => handleAdvance(q.ms, q.label.replace('+', ''))}
              className="py-2.5 bg-white rounded-lg text-[14px] hover:bg-wechat-bg active:bg-wechat-divider"
            >
              {q.label}
            </button>
          ))}
        </div>

        <div className="mt-5 text-[12px] text-wechat-textGray mb-2">回拨时间</div>
        <div className="grid grid-cols-3 gap-2">
          {rewind.map((q) => (
            <button
              key={q.label}
              onClick={() => handleAdvance(q.ms, q.label)}
              className="py-2.5 bg-white rounded-lg text-[14px] hover:bg-wechat-bg active:bg-wechat-divider"
            >
              {q.label}
            </button>
          ))}
          <button
            onClick={handleSetExact}
            disabled={setting}
            className="py-2.5 bg-white rounded-lg text-[14px] text-wechat-link hover:bg-wechat-bg active:bg-wechat-divider disabled:opacity-50"
          >
            指定时刻…
          </button>
        </div>

        {tip && (
          <div className="mt-5 text-center text-[13px] text-wechat-green">{tip}</div>
        )}

        <div className="mt-8 text-[11px] text-wechat-textGray leading-relaxed">
          提示：单卡时间是该角色世界专属的独立时间线，与全局时间互不影响。
          往后调可推进剧情，往回调可"重来"。时间快于全局时会在全局视角下锁定该世界的后台行为。
        </div>
      </div>
    </div>
  )
}