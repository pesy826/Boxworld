import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, Trash2, Smile, ImageIcon, Pencil } from 'lucide-react'
import { useStickerStore, useAvatarLibStore } from '../stores/assetStore'

type Tab = 'sticker' | 'avatar'

export default function AssetLibraryPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('sticker')

  return (
    <div className="min-h-full bg-wechat-bg">
      <header className="h-header-safe flex items-center px-2 bg-white border-b border-wechat-divider sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-[17px] font-semibold flex-1 text-center">素材库</h1>
        <div className="w-9" />
      </header>

      {/* Tab 切换 */}
      <div className="bg-white flex border-b border-wechat-divider">
        <TabButton active={tab === 'sticker'} onClick={() => setTab('sticker')} icon={<Smile size={15} />} label="表情包" />
        <TabButton active={tab === 'avatar'} onClick={() => setTab('avatar')} icon={<ImageIcon size={15} />} label="头像库" />
      </div>

      {tab === 'sticker' ? <StickerPanel /> : <AvatarPanel />}
    </div>
  )
}

function TabButton({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2.5 text-[14px] flex items-center justify-center gap-1 border-b-2 ${active ? 'border-wechat-green text-wechat-green font-medium' : 'border-transparent text-wechat-textGray'
        }`}
    >
      {icon}{label}
    </button>
  )
}

// ============ 表情包面板 ============

function StickerPanel() {
  const stickers = useStickerStore((s) => s.stickers)
  const importFiles = useStickerStore((s) => s.importFiles)
  const updateDesc = useStickerStore((s) => s.updateDesc)
  const remove = useStickerStore((s) => s.remove)
  const removeAll = useStickerStore((s) => s.removeAll)
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setImporting(true)
    try {
      const n = await importFiles(Array.from(files))
      alert(`成功导入 ${n} 个表情（重名已跳过）`)
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleEditDesc = async (id: string, current: string) => {
    const next = prompt('修改表情描述（AI 按这个描述选择表情）：', current)
    if (next?.trim() && next.trim() !== current) {
      await updateDesc(id, next.trim())
    }
  }

  return (
    <div className="pb-8">
      <div className="px-4 py-2 text-[12px] text-wechat-textGray">
        共 {stickers.length} 个表情。文件名会自动成为描述（如「开心搓手手.gif」→ 描述「开心搓手手」），AI 聊天时按描述挑表情发送。
        建议用 GitHub 的 ChineseBQB 等表情包仓库，文件名即含义，下载后批量导入。
      </div>

      <div className="px-4 flex gap-2 mb-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="flex-1 py-2 bg-wechat-green text-white rounded text-[13px] flex items-center justify-center gap-1 disabled:opacity-50"
        >
          <Plus size={14} />
          {importing ? '导入中...' : '批量导入表情（可多选）'}
        </button>
        {stickers.length > 0 && (
          <button
            onClick={async () => {
              if (confirm(`清空全部 ${stickers.length} 个表情？`)) await removeAll()
            }}
            className="px-3 py-2 bg-white text-red-500 rounded text-[13px]"
          >
            清空
          </button>
        )}
      </div>
      <input
        ref={fileRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {stickers.length === 0 ? (
        <div className="px-4 py-12 text-center text-wechat-textGray text-[13px]">
          还没有表情包<br />
          <span className="text-[12px]">导入后 AI 就能在聊天里发表情了</span>
        </div>
      ) : (
        <div className="px-3 grid grid-cols-4 gap-2">
          {stickers.map((s) => (
            <div key={s.id} className="bg-white rounded-lg p-1.5 relative group">
              <img src={s.image} alt={s.desc} className="w-full aspect-square object-contain rounded" />
              <button
                onClick={() => handleEditDesc(s.id, s.desc)}
                className="block w-full text-[10px] text-wechat-textGray truncate mt-1 text-center"
                title={`${s.desc}（点击编辑）`}
              >
                {s.desc}
                <Pencil size={8} className="inline ml-0.5 opacity-50" />
              </button>
              <button
                onClick={async () => { if (confirm(`删除表情「${s.desc}」？`)) await remove(s.id) }}
                className="absolute top-0.5 right-0.5 p-1 bg-black/40 rounded opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={11} className="text-white" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============ 头像库面板 ============

const PRESET_TAGS = ['男', '女', '动漫', '写实']

function AvatarPanel() {
  const avatars = useAvatarLibStore((s) => s.avatars)
  const importFiles = useAvatarLibStore((s) => s.importFiles)
  const updateTags = useAvatarLibStore((s) => s.updateTags)
  const remove = useAvatarLibStore((s) => s.remove)
  const removeAll = useAvatarLibStore((s) => s.removeAll)
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importTags, setImportTags] = useState<Set<string>>(new Set())

  const toggleImportTag = (t: string) => {
    setImportTags((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setImporting(true)
    try {
      const n = await importFiles(Array.from(files), [...importTags])
      alert(`成功导入 ${n} 张头像`)
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleEditTags = async (id: string, current: string[]) => {
    const next = prompt('编辑标签（空格分隔，如：男 动漫）：', current.join(' '))
    if (next !== null) {
      await updateTags(id, next.split(/\s+/).map((t) => t.trim()).filter(Boolean))
    }
  }

  const unusedCount = avatars.filter((a) => !a.usedBy).length

  return (
    <div className="pb-8">
      <div className="px-4 py-2 text-[12px] text-wechat-textGray">
        共 {avatars.length} 张（未使用 {unusedCount}）。生成 NPC 时自动从库里分配未用过的头像，按标签优先匹配（如 NPC 是男性优先拿「男」标签的）。
      </div>

      {/* 导入时的标签选择 */}
      <div className="px-4 mb-2">
        <div className="text-[11px] text-wechat-textGray mb-1">本次导入统一打标签（可不选）：</div>
        <div className="flex gap-1.5 flex-wrap">
          {PRESET_TAGS.map((t) => (
            <button
              key={t}
              onClick={() => toggleImportTag(t)}
              className={`px-2.5 py-1 rounded-full text-[12px] border ${importTags.has(t)
                ? 'bg-wechat-green text-white border-wechat-green'
                : 'bg-white text-wechat-textGray border-wechat-divider'
                }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 flex gap-2 mb-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="flex-1 py-2 bg-wechat-green text-white rounded text-[13px] flex items-center justify-center gap-1 disabled:opacity-50"
        >
          <Plus size={14} />
          {importing ? '导入中...' : '批量导入头像（可多选）'}
        </button>
        {avatars.length > 0 && (
          <button
            onClick={async () => {
              if (confirm(`清空全部 ${avatars.length} 张头像？已被角色使用的头像不受影响（角色头像是独立副本）。`)) await removeAll()
            }}
            className="px-3 py-2 bg-white text-red-500 rounded text-[13px]"
          >
            清空
          </button>
        )}
      </div>
      <input
        ref={fileRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {avatars.length === 0 ? (
        <div className="px-4 py-12 text-center text-wechat-textGray text-[13px]">
          还没有头像<br />
          <span className="text-[12px]">导入后生成的 NPC 就有头像了</span>
        </div>
      ) : (
        <div className="px-3 grid grid-cols-4 gap-2">
          {avatars.map((a) => (
            <div key={a.id} className="bg-white rounded-lg p-1.5 relative group">
              <img src={a.image} alt="" className={`w-full aspect-square object-cover rounded ${a.usedBy ? 'opacity-40' : ''}`} />
              {a.usedBy && (
                <span className="absolute top-1.5 left-1.5 text-[9px] px-1 py-0.5 bg-black/50 text-white rounded">已用</span>
              )}
              <button
                onClick={() => handleEditTags(a.id, a.tags)}
                className="block w-full text-[10px] text-wechat-textGray truncate mt-1 text-center"
                title="点击编辑标签"
              >
                {a.tags.length > 0 ? a.tags.join('·') : '无标签'}
                <Pencil size={8} className="inline ml-0.5 opacity-50" />
              </button>
              <button
                onClick={async () => { if (confirm('删除这张头像？')) await remove(a.id) }}
                className="absolute top-0.5 right-0.5 p-1 bg-black/40 rounded opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={11} className="text-white" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}