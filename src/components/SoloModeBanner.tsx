import { useNavigate } from 'react-router-dom'
import { useCharacterStore } from '../stores/characterStore'
import { exitSoloMode } from '../services/soloModeService'
import { useCharacterTime } from '../services/useVirtualTime'
import { formatFull } from '../utils/time'
import { X, User, Clock } from 'lucide-react'

export default function SoloModeBanner({ characterId }: { characterId: string }) {
  const navigate = useNavigate()
  const char = useCharacterStore((s) => s.getById(characterId))
  const soloTime = useCharacterTime(characterId)

  if (!char) return null

  return (
    <div className="bg-amber-500 text-white px-4 py-2 flex items-center gap-2 text-[13px]" data-tour="solo-banner">
      <User size={16} className="shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">单卡模式 · {char.name}</div>
        {/* 点击时间进入单卡时间调整页 */}
        <button
          onClick={() => navigate(`/solo-time/${characterId}`)}
          className="text-[11px] opacity-90 truncate flex items-center gap-1 hover:opacity-100"
          title="点击调整该世界时间"
        >
          <Clock size={11} className="shrink-0" />
          {formatFull(soloTime)}
        </button>
      </div>
      <button
        onClick={async () => { await exitSoloMode() }}
        className="shrink-0 flex items-center gap-1 bg-white/20 px-2 py-1 rounded text-[12px] hover:bg-white/30"
      >
        <X size={12} />
        退出
      </button>
    </div>
  )
}
