import { useState } from 'react'
import { Play, Pause, FastForward, Clock } from 'lucide-react'
import { useVirtualTime } from '../services/useVirtualTime'
import { timeService } from '../services/timeService'
import { formatFull, hours, minutes, days } from '../utils/time'

/**
 * 虚拟时间控制条
 * 用于调试和"跳时间触发剧情"
 */
export default function TimeControlBar() {
  const now = useVirtualTime()
  const [showJumpInput, setShowJumpInput] = useState(false)
  const [jumpValue, setJumpValue] = useState('')

// 防御性：如果 TimeService 还没就绪，先用默认值
let paused = false
try {
  paused = timeService.getState().paused
} catch {
  // 还没初始化，忽略
}


  const togglePause = async () => {
    if (paused) await timeService.resume()
    else await timeService.pause()
  }

  const handleQuickJump = async (deltaMs: number) => {
    await timeService.advance(deltaMs)
  }

  const handleJumpToInput = async () => {
    // 输入格式：YYYY-MM-DD H mm 或 YYYY/MM/DD H mm
    const normalized = jumpValue.replace(/\//g, '-').trim()
    const ts = Date.parse(normalized)
    if (isNaN(ts)) {
      alert('时间格式不对，请用 2026-06-08 14:30 这样的格式')
      return
    }
    await timeService.jumpTo(ts)
    setShowJumpInput(false)
    setJumpValue('')
  }

  return (
    <div className="bg-white border-y border-wechat-divider">
      <div className="px-4 py-3 flex items-center gap-3">
        <Clock size={18} className="text-wechat-green shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-wechat-textGray">虚拟时间</div>
          <div className="text-[15px] font-medium truncate">{formatFull(now)}</div>
        </div>
        <button
          onClick={togglePause}
          className="p-2 rounded-full hover:bg-wechat-bg"
          title={paused ? '恢复时间流逝' : '暂停时间流逝'}
        >
          {paused ? <Play size={18} /> : <Pause size={18} />}
        </button>
      </div>

      <div className="px-4 pb-3 flex flex-wrap gap-2">
        <QuickBtn onClick={() => handleQuickJump(minutes(30))}>+30 分</QuickBtn>
        <QuickBtn onClick={() => handleQuickJump(hours(1))}>+1 小时</QuickBtn>
        <QuickBtn onClick={() => handleQuickJump(hours(3))}>+3 小时</QuickBtn>
        <QuickBtn onClick={() => handleQuickJump(hours(8))}>+8 小时</QuickBtn>
        <QuickBtn onClick={() => handleQuickJump(days(1))}>+1 天</QuickBtn>
        <QuickBtn onClick={() => setShowJumpInput(!showJumpInput)}>
          <FastForward size={12} className="inline mr-1" />
          指定时刻
        </QuickBtn>
      </div>

      {showJumpInput && (
        <div className="px-4 pb-3 flex gap-2">
          <input
            type="text"
            value={jumpValue}
            onChange={(e) => setJumpValue(e.target.value)}
            placeholder="2026-06-08 14:30"
            className="flex-1 px-3 py-1.5 text-sm border border-wechat-divider rounded outline-none focus:border-wechat-green"
          />
          <button
            onClick={handleJumpToInput}
            className="px-3 py-1.5 text-sm bg-wechat-green text-white rounded"
          >
            跳转
          </button>
        </div>
      )}
    </div>
  )
}

function QuickBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 text-xs bg-wechat-bg rounded-full hover:bg-wechat-divider transition-colors"
    >
      {children}
    </button>
  )
}
