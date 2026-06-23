import { useRef, useState } from 'react'
import { Smile, Plus, X, ChevronDown, ChevronUp } from 'lucide-react'
import { useCharacterStore } from '../stores/characterStore'
import { fileToCompressedDataUrl } from '../utils/image'
import { CUSTOM_STICKER_SLOTS } from '../types'

/**
 * 角色专属「常用表情」管理：详情页「设置用户人设」下方的折叠卡片。
 * - 预设情绪槽位（开心/撒娇/难过/.../随意）+ 用户可自定义新增槽位
 * - 每槽位可上传多张表情（支持一次多选），缩略图可点叉删除
 * - "随意"槽 = 不限场景的百搭表情
 * 数据存到 character.customStickers（key=槽位名，value=base64[]），压缩 256px JPEG。
 */
export default function CharacterStickerSlots({
  character,
}: {
  character: { id: string; customStickers?: Record<string, string[]> }
}) {
  const updateCharacter = useCharacterStore((s) => s.update)
  const [expanded, setExpanded] = useState(false)
  const [busySlot, setBusySlot] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const uploadingSlotRef = useRef<string>('')

  const cs = character.customStickers || {}

  // 展示用的槽位顺序：预设槽位 + 用户额外加的自定义槽位
  const extraSlots = Object.keys(cs).filter((k) => !(CUSTOM_STICKER_SLOTS as readonly string[]).includes(k))
  const slots = [...CUSTOM_STICKER_SLOTS, ...extraSlots]

  const totalCount = Object.values(cs).reduce((sum, arr) => sum + (arr?.length || 0), 0)

  const handleUploadClick = (slot: string) => {
    uploadingSlotRef.current = slot
    inputRef.current?.click()
  }

  const handleFiles = async (files: FileList | null) => {
    const slot = uploadingSlotRef.current
    if (!files || files.length === 0 || !slot) return
    setBusySlot(slot)
    try {
      const images: string[] = []
      for (const f of Array.from(files)) {
        try {
          images.push(await fileToCompressedDataUrl(f, 256, 0.85))
        } catch { /* 跳过失败文件 */ }
      }
      if (images.length > 0) {
        const next = { ...cs, [slot]: [...(cs[slot] || []), ...images] }
        await updateCharacter(character.id, { customStickers: next })
      }
    } finally {
      setBusySlot(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = async (slot: string, index: number) => {
    const arr = [...(cs[slot] || [])]
    arr.splice(index, 1)
    const next = { ...cs }
    if (arr.length > 0) next[slot] = arr
    else delete next[slot]
    await updateCharacter(character.id, { customStickers: next })
  }

  const handleAddSlot = async () => {
    const name = prompt('新增表情情绪分类名（如：得意、委屈）：')?.trim()
    if (!name) return
    if (cs[name] || (CUSTOM_STICKER_SLOTS as readonly string[]).includes(name)) {
      alert('该分类已存在')
      return
    }
    await updateCharacter(character.id, { customStickers: { ...cs, [name]: [] } })
  }

  return (
    <div className="mt-3 mx-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* 折叠头：仿「设置用户人设」的卡片样式 */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full bg-white rounded-lg border border-wechat-divider px-4 py-3 flex items-center gap-2 text-left"
      >
        <Smile size={20} className="text-wechat-green shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-medium">自定义常用表情</div>
          <div className="text-[11px] text-wechat-textGray mt-0.5">
            按情绪分类上传 TA 爱用的表情，聊天时会优先发{totalCount > 0 ? `（已上传 ${totalCount} 张）` : ''}
          </div>
        </div>
        {expanded ? <ChevronUp size={16} className="text-wechat-textGray shrink-0" /> : <ChevronDown size={16} className="text-wechat-textGray shrink-0" />}
      </button>

      {expanded && (
        <div className="mt-2 bg-white rounded-lg border border-wechat-divider p-3 space-y-3">
          <div className="text-[11px] text-wechat-textGray">
            「随意」分类放不好界定情绪的百搭表情，任何场景都可能用到。每个分类可多传几张避免重复。
          </div>
          {slots.map((slot) => {
            const images = cs[slot] || []
            return (
              <div key={slot} className="border-t border-wechat-divider/50 pt-2 first:border-t-0 first:pt-0">
                <div className="text-[13px] font-medium mb-2 flex items-center gap-1">
                  {slot === '随意' ? '随意（百搭，不限场景）' : slot}
                  <span className="text-[11px] text-wechat-textGray">{images.length > 0 ? `· ${images.length}` : ''}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {images.map((img, i) => (
                    <div key={i} className="relative w-14 h-14">
                      <img src={img} alt="" className="w-14 h-14 object-cover rounded border border-wechat-divider" />
                      <button
                        onClick={() => handleRemove(slot, i)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center"
                        title="删除"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => handleUploadClick(slot)}
                    disabled={busySlot === slot}
                    className="w-14 h-14 rounded border border-dashed border-gray-300 flex items-center justify-center text-gray-400 disabled:opacity-50"
                    title="上传表情（可多选）"
                  >
                    {busySlot === slot ? '…' : <Plus size={22} />}
                  </button>
                </div>
              </div>
            )
          })}
          <div className="border-t border-wechat-divider/50 pt-2">
            <button
              onClick={handleAddSlot}
              className="text-[13px] text-wechat-green flex items-center gap-1"
            >
              <Plus size={14} />
              新增情绪分类
            </button>
          </div>
        </div>
      )}
    </div>
  )
}