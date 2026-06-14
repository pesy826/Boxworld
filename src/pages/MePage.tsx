import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, BookOpen, Settings as SettingsIcon, Layers, Activity, Bug, Camera } from 'lucide-react'
import TimeControlBar from '../components/TimeControlBar'
import Avatar from '../components/Avatar'
import { useSettingsStore } from '../stores/settingsStore'
import { useCharacterStore } from '../stores/characterStore'
import { fileToCompressedDataUrl } from '../utils/image'
import { useCharacterTime } from '../services/useVirtualTime'
import { formatFull } from '../utils/time'
import { usePageTour } from '../components/TourOverlay'
import { meTour } from '../components/tours'



export default function MePage() {
  const navigate = useNavigate()
  const settings = useSettingsStore((s) => s.settings)
  usePageTour(meTour)
  const updateUserPersona = useSettingsStore((s) => s.updateUserPersona)
  const fileRef = useRef<HTMLInputElement>(null)

  const userName = settings?.userPersona.name || '盒世界用户'
  const userAvatar = settings?.userPersona.avatar

  const handlePickAvatar = () => {
    fileRef.current?.click()
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const dataUrl = await fileToCompressedDataUrl(file, 512, 0.85)
      await updateUserPersona({ avatar: dataUrl })
    } catch (e) {
      alert('图片处理失败：' + (e as any)?.message)
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="min-h-full bg-wechat-bg">
      <header className="h-header-safe flex items-center px-4 bg-white border-b border-wechat-divider">
        <h1 className="text-[17px] font-semibold">我</h1>
      </header>

      {/* 用户信息卡 */}
      <div className="mt-2 bg-white px-4 py-5 flex items-center gap-3">
        <button onClick={handlePickAvatar} className="relative group" title="更换头像">
          <Avatar src={userAvatar} name={userName} size={64} />
          <div className="absolute inset-0 bg-black/40 rounded-md opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <Camera size={20} className="text-white" />
          </div>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[18px] font-medium truncate">{userName}</div>
          <SoloStatusLine />
        </div>
      </div>

      <div className="mt-2" data-tour="time-control">
        <GlobalTimeHint />
        <TimeControlBar />
      </div>


      <div className="mt-2 bg-white">
        <MenuRow
          icon={<BookOpen size={18} className="text-wechat-green" />}
          label="世界书"
          tour="menu-lorebooks"
          onClick={() => navigate('/lorebooks')}
        />
        <MenuRow
          icon={<Layers size={18} className="text-purple-500" />}
          label="预设"
          tour="menu-presets"
          onClick={() => navigate('/presets')}
        />
        <MenuRow
          icon={<Activity size={18} className="text-orange-500" />}
          label="补算日志"
          tour="menu-ticklog"
          onClick={() => navigate('/tick-log')}
        />
        <MenuRow
          icon={<Bug size={18} className="text-blue-500" />}
          label="Prompt 调试"
          onClick={() => navigate('/debug-prompts')}
        />
        <MenuRow
          icon={<SettingsIcon size={18} className="text-wechat-textGray" />}
          label="设置"
          tour="menu-settings"
          onClick={() => navigate('/settings')}
        />
        <div className="px-4 py-3 text-sm text-wechat-textGray">关于</div>
      </div>
    </div>
  )
}

function SoloStatusLine() {
  const activeSoloId = useSettingsStore((s) => s.settings?.activeSoloCharacterId)
  const char = useCharacterStore((s) => activeSoloId ? s.getById(activeSoloId) : undefined)

  if (!activeSoloId || !char) {
    return <div className="text-[12px] text-wechat-textGray mt-1">全局模式</div>
  }
  return (
    <div className="text-[12px] text-amber-600 mt-1 flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
      单卡模式 · {char.name}
    </div>
  )
}

function MenuRow({ icon, label, onClick, tour }: { icon: React.ReactNode; label: string; onClick: () => void; tour?: string }) {
  return (
    <button
      onClick={onClick}
      data-tour={tour}
      className="w-full px-4 py-3 border-b border-wechat-divider text-sm flex items-center justify-between hover:bg-wechat-bg"
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      <ChevronRight size={18} className="text-wechat-textGray" />
    </button>
  )
}
function GlobalTimeHint() {
  const activeSoloId = useSettingsStore((s) => s.settings?.activeSoloCharacterId)
  const char = useCharacterStore((s) => activeSoloId ? s.getById(activeSoloId) : undefined)
  const soloTime = useCharacterTime(activeSoloId)

  if (!activeSoloId || !char) return null

  return (
    <div className="bg-amber-50 border-y border-amber-200 px-4 py-2 text-[12px] text-amber-700">
      你正处于「{char.name}」单卡模式，当前单卡时间：
      <span className="font-medium">{formatFull(soloTime)}</span>
      <br />
      <span className="text-amber-600/80">下方控制的是「全局时间」，不影响单卡进度。</span>
    </div>
  )
}
