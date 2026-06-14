interface Props {
  src?: string
  name: string
  size?: number
  className?: string
}

/**
 * 头像组件。有图片用图片，没图片用首字符占位。
 */
export default function Avatar({ src, name, size = 44, className = '' }: Props) {
  const initial = name.charAt(0).toUpperCase() || '?'
  return (
    <div
      className={`shrink-0 rounded-md overflow-hidden bg-wechat-green/80 flex items-center justify-center text-white font-medium ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {src
        ? <img src={src} alt={name} className="w-full h-full object-cover" />
        : <span>{initial}</span>}
    </div>
  )
}
