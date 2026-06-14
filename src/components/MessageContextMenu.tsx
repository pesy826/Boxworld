import { useEffect, useRef } from 'react'

export interface MenuItem {
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

interface Props {
  /** 菜单位置（屏幕坐标） */
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export default function MessageContextMenu({ x, y, items, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)

  // 点外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // 异步注册避免立即触发
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler)
      document.addEventListener('touchstart', handler)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [onClose])

  // 防止菜单溢出屏幕
  useEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let nx = x, ny = y
    if (rect.right > vw) nx = Math.max(4, vw - rect.width - 4)
    if (rect.bottom > vh) ny = Math.max(4, vh - rect.height - 4)
    if (nx !== x || ny !== y) {
      el.style.left = `${nx}px`
      el.style.top = `${ny}px`
    }
  }, [x, y])

  return (
    <div
      ref={menuRef}
      className="fixed bg-white shadow-lg rounded border border-wechat-divider z-50 text-[14px] min-w-[120px] overflow-hidden"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => {
            if (!item.disabled) {
              item.onClick()
              onClose()
            }
          }}
          disabled={item.disabled}
          className={`w-full text-left px-3 py-2 hover:bg-wechat-bg disabled:opacity-40 disabled:cursor-not-allowed ${
            item.danger ? 'text-red-500' : ''
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
