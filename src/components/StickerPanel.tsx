import { useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useStickerStore } from '../stores/assetStore'

/**
 * 用户发表情的表情面板（聊天输入栏弹出）。
 * 与微信一致：默认只展示用户"添加的单个表情"（favorite=true），不展示整个素材库。
 * 用户可点 + 自己上传表情；也可在聊天里把角色发的表情/图片"添加到喜欢"。
 * 点击表情回调 onPick(desc)，由调用方负责发送。
 */
export default function StickerPanel({
  onPick,
}: {
  onPick: (desc: string) => void
}) {
  const stickers = useStickerStore((s) => s.stickers)
  const importUserStickers = useStickerStore((s) => s.importUserStickers)
  const toggleFavorite = useStickerStore((s) => s.toggleFavorite)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)

  const favorites = stickers.filter((s) => s.favorite)

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    await importUserStickers(Array.from(files))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // 取消收藏（从面板移除；不删素材库本身，AI 仍可能用到内置库的同款）
  const handleRemoveFavorite = async (id: string) => {
    await toggleFavorite(id, false)
  }

  return (
    <div className="bg-white border-t border-wechat-divider max-h-[260px] overflow-y-auto">
      <div className="px-3 pt-3 flex items-center justify-between">
        <span className="text-[13px] text-wechat-textGray">添加的单个表情</span>
        {favorites.length > 0 && (
          <button
            onClick={() => setEditing((v) => !v)}
            className={`text-[12px] ${editing ? 'text-wechat-green' : 'text-wechat-textGray'}`}
          >
            {editing ? '完成' : '管理'}
          </button>
        )}
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 p-3">
        {/* 上传按钮 */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="aspect-square rounded border-2 border-dashed border-wechat-divider flex items-center justify-center text-wechat-textGray hover:border-wechat-green hover:text-wechat-green"
          title="添加表情"
        >
          <Plus size={28} />
        </button>
        {favorites.map((s) => (
          <div key={s.id} className="relative aspect-square">
            <button
              onClick={() => editing ? handleRemoveFavorite(s.id) : onPick(s.desc)}
              className="w-full h-full rounded bg-wechat-bg overflow-hidden hover:ring-2 hover:ring-wechat-green"
              title={s.desc}
            >
              <img src={s.image} alt={s.desc} className="w-full h-full object-contain" />
            </button>
            {editing && (
              <button
                onClick={() => handleRemoveFavorite(s.id)}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow"
                title="移除"
              >
                <X size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
      {favorites.length === 0 && (
        <div className="px-4 pb-4 text-center text-wechat-textGray text-[12px]">
          还没有添加的表情，点上面的 + 上传，或长按聊天里的表情/图片"添加到喜欢"
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleUpload(e.target.files)}
      />
    </div>
  )
}