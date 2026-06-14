import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/**
 * 图片大图查看器（点击聊天/朋友圈图片放大）。
 * 点击遮罩或关闭按钮关闭；图片本身点击不关闭，便于查看。
 */
export default function ImageLightbox({
  src,
  onClose,
}: {
  src: string
  onClose: () => void
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/80 hover:text-white p-2"
        aria-label="关闭"
      >
        <X size={28} />
      </button>
      <img
        src={src}
        alt="查看大图"
        className="max-w-[95vw] max-h-[90vh] object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  )
}