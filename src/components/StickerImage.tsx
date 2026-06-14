import { useStickerStore } from '../stores/assetStore'

/**
 * 表情消息渲染：按描述匹配表情库的图片显示；
 * 匹配不到回退为 [文字] 形式（兼容无表情库 / AI 编了不存在的表情名）。
 */
export default function StickerImage({ desc, size = 120 }: { desc: string; size?: number }) {
  const sticker = useStickerStore((s) => s.findByDesc(desc))

  if (!sticker) {
    return <span className="italic text-wechat-textGray">[{desc}]</span>
  }
  return (
    <img
      src={sticker.image}
      alt={desc}
      title={desc}
      style={{ maxWidth: size, maxHeight: size }}
      className="rounded object-contain"
    />
  )
}