import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { useAvatarLibStore } from '../stores/assetStore'

/**
 * 从头像库挑头像的弹窗。
 * 点击头像回调 onPick(image)（不修改 usedBy 占用状态——手动挑选不参与自动分配逻辑的占用管理，
 * 但会标记 usedBy 以避免后续 NPC 自动分配撞同款）。
 */
export default function AvatarPickerDialog({
  forCharacterId,
  onPick,
  onClose,
}: {
  /** 选中后把头像标记为该角色占用（可选） */
  forCharacterId?: string
  onPick: (image: string) => void
  onClose: () => void
}) {
  const navigate = useNavigate()
  const avatars = useAvatarLibStore((s) => s.avatars)

  const handlePick = async (id: string, image: string) => {
    if (forCharacterId) {
      // 标记占用（不强制：同一头像也可被重复选，但自动分配会跳过已占用的）
      const target = useAvatarLibStore.getState().avatars.find((a) => a.id === id)
      if (target && !target.usedBy) {
        const { db } = await import('../db')
        await db.avatarLibrary.put({ ...target, usedBy: forCharacterId })
        await useAvatarLibStore.getState().load()
      }
    }
    onPick(image)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg w-full max-w-md max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-wechat-divider">
          <div className="text-[15px] font-medium">从头像库选择</div>
          <button onClick={onClose} className="p-1">
            <X size={18} />
          </button>
        </div>

        {avatars.length === 0 ? (
          <div className="px-4 py-10 text-center text-wechat-textGray text-[13px]">
            头像库还没有头像
            <button
              onClick={() => { onClose(); navigate('/assets') }}
              className="block mx-auto mt-2 text-wechat-link text-[13px]"
            >
              去素材库导入
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-3">
            <div className="grid grid-cols-4 gap-2">
              {avatars.map((a) => (
                <button
                  key={a.id}
                  onClick={() => handlePick(a.id, a.image)}
                  className="relative aspect-square rounded overflow-hidden hover:ring-2 hover:ring-wechat-green"
                  title={a.tags.join(' / ') || undefined}
                >
                  <img src={a.image} alt="" className="w-full h-full object-cover" />
                  {a.usedBy && (
                    <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[9px] text-center leading-4">
                      已占用
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}