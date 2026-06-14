import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, BookOpen } from 'lucide-react'
import { useLorebookStore } from '../stores/lorebookStore'
import { db } from '../db'

export default function LorebooksPage() {
  const navigate = useNavigate()
  const lorebooks = useLorebookStore((s) => s.lorebooks)
  const create = useLorebookStore((s) => s.createLorebook)
  const [counts, setCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const result: Record<string, number> = {}
      for (const b of lorebooks) {
        result[b.id] = await db.lorebookEntries.where('lorebookId').equals(b.id).count()
      }
      if (!cancelled) setCounts(result)
    })()
    return () => { cancelled = true }
  }, [lorebooks])

  const handleCreate = async () => {
    const name = prompt('新世界书的名字：')
    if (!name?.trim()) return
    const book = await create(name.trim())
    navigate(`/lorebook/${book.id}`)
  }

  return (
    <div className="min-h-full bg-wechat-bg">
      <header className="h-header-safe flex items-center px-2 bg-white border-b border-wechat-divider sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-[17px] font-semibold flex-1 text-center">世界书</h1>
        <button onClick={handleCreate} className="p-2 -mr-2" title="新建">
          <Plus size={22} />
        </button>
      </header>

      {lorebooks.length === 0 ? (
        <div className="px-4 py-12 text-center text-wechat-textGray text-sm">
          还没有世界书<br />
          <button
            className="mt-3 px-4 py-2 text-wechat-green text-[14px]"
            onClick={handleCreate}
          >
            点击创建
          </button>
        </div>
      ) : (
        <div className="mt-2 bg-white">
          {lorebooks.map((b) => (
            <button
              key={b.id}
              onClick={() => navigate(`/lorebook/${b.id}`)}
              className="w-full flex items-center gap-3 px-4 py-3 border-b border-wechat-divider hover:bg-wechat-bg text-left"
            >
              <BookOpen size={20} className="text-wechat-green shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[15px] truncate">{b.name}</div>
                <div className="text-[12px] text-wechat-textGray">
                  {counts[b.id] ?? '—'} 条条目
                </div>
              </div>
              <ChevronRight size={18} className="text-wechat-textGray" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
