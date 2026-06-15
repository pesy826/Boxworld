import { useMemo, useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import { useCharacterStore } from '../stores/characterStore'
import Avatar from './Avatar'
import type { Character } from '../types'

/**
 * 群聊「邀请成员」选人弹窗。
 * 候选范围：
 * - 全局群（worldId 为空）：所有主卡（非 NPC），排除已在群里的
 * - 单卡世界群：该世界主卡 + 好友 NPC（isContact !== false），排除已在群里的
 */
export default function GroupMemberPicker({
  existingMemberIds,
  worldId,
  onConfirm,
  onClose,
}: {
  existingMemberIds: string[]
  worldId?: string
  onConfirm: (ids: string[]) => void
  onClose: () => void
}) {
  const characters = useCharacterStore((s) => s.characters)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const existing = useMemo(() => new Set(existingMemberIds), [existingMemberIds])

  const candidates = useMemo(() => {
    let list: Character[]
    if (worldId) {
      list = characters.filter(
        (c) =>
          c.id === worldId ||
          (c.isNpc && c.parentWorldId === worldId && c.isContact !== false),
      )
    } else {
      list = characters.filter((c) => !c.isNpc)
    }
    return list.filter((c) => !existing.has(c.id))
  }, [characters, worldId, existing])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl max-h-[80vh] flex flex-col pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-wechat-divider shrink-0">
          <span className="text-[16px] font-medium">邀请成员</span>
          <button onClick={onClose} className="p-1 -mr-1 text-wechat-textGray">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {candidates.length === 0 ? (
            <div className="px-4 py-10 text-center text-wechat-textGray text-[13px]">
              没有可邀请的角色
            </div>
          ) : (
            candidates.map((c) => (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                className="w-full flex items-center gap-3 px-4 py-3 border-b border-wechat-divider hover:bg-wechat-bg text-left"
              >
                {selected.has(c.id) ? (
                  <CheckCircle2 size={20} className="text-wechat-green shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-wechat-divider shrink-0" />
                )}
                <Avatar src={c.avatar} name={c.name} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] truncate">{c.name}</div>
                  {c.isNpc && (
                    <div className="text-[11px] text-wechat-textGray truncate">
                      NPC{c.npcRelation ? ` · ${c.npcRelation}` : ''}
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-3 border-t border-wechat-divider shrink-0">
          <button
            onClick={() => onConfirm([...selected])}
            disabled={selected.size === 0}
            className="w-full py-2.5 bg-wechat-green text-white rounded-lg text-[15px] disabled:opacity-40"
          >
            邀请（{selected.size}）
          </button>
        </div>
      </div>
    </div>
  )
}