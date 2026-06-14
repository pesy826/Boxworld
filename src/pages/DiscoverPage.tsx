import { useNavigate } from 'react-router-dom'
import { Camera, ChevronRight } from 'lucide-react'

export default function DiscoverPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-full bg-wechat-bg">
      <header className="h-header-safe flex items-center px-4 bg-white border-b border-wechat-divider">
        <h1 className="text-[17px] font-semibold">发现</h1>
      </header>

      <div className="mt-2 bg-white">
        <button
          onClick={() => navigate('/moments')}
          className="w-full px-4 py-3 border-b border-wechat-divider text-sm flex items-center justify-between hover:bg-wechat-bg"
        >
          <span className="flex items-center gap-2">
            <Camera size={18} className="text-orange-500" />
            朋友圈
          </span>
          <ChevronRight size={18} className="text-wechat-textGray" />
        </button>
      </div>
    </div>
  )
}
