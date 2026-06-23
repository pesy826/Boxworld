import { useStickerStore } from '../stores/assetStore'
import { useCharacterStore } from '../stores/characterStore'
import { isCustomStickerName, resolveCustomSticker } from '../services/customStickers'

/**
 * 表情消息渲染：
 * 1. 若是角色专属表情命名（自定义·情绪·序号）→ 从对应角色的 customStickers 解析 base64 显示；
 * 2. 否则按描述匹配通用表情库的图片显示；
 * 3. 都匹配不到回退为 [文字] 形式（兼容无表情库 / AI 编了不存在的表情名）。
 *
 * @param senderCharacterId 发该表情的角色 id（专属表情按此角色解析；单聊传对方角色 id，群聊传 senderId）
 */
export default function StickerImage({
  desc, size = 120, senderCharacterId,
}: {
  desc: string
  size?: number
  senderCharacterId?: string
}) {
  // 角色专属表情：从对应角色解析
  const customImage = useCharacterStore((s) => {
    if (!senderCharacterId || !isCustomStickerName(desc)) return undefined
    return resolveCustomSticker(s.getById(senderCharacterId), desc)
  })
  const sticker = useStickerStore((s) => (customImage ? undefined : s.findByDesc(desc)))

  const image = customImage || sticker?.image
  if (!image) {
    return <span className="italic text-wechat-textGray">[{desc}]</span>
  }
  return (
    <img
      src={image}
      alt={desc}
      title={desc}
      style={{ maxWidth: size, maxHeight: size }}
      className="rounded object-contain"
    />
  )
}
