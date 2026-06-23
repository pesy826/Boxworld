import { useEffect, useRef, useState } from 'react'
import { cropDataUrl } from '../utils/image'

/**
 * 图片裁剪弹层：用户拖动裁剪框选定要展示的区域。
 * - 裁剪框按固定宽高比（默认按聊天窗口竖屏 9:16），可整体拖动 + 四角缩放
 * - 确认后调 cropDataUrl 输出裁好的 JPEG dataURL
 */
export default function ImageCropper({
  src,
  aspect = 9 / 16,
  onConfirm,
  onCancel,
}: {
  /** 原图 dataURL */
  src: string
  /** 裁剪框宽高比（宽/高）。聊天背景竖屏，默认 9/16 */
  aspect?: number
  onConfirm: (dataUrl: string) => void
  onCancel: () => void
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  // 图片在舞台中实际显示的区域（contain 后的像素矩形）
  const [imgRect, setImgRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  // 裁剪框（相对舞台的像素）
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const dragRef = useRef<{
    mode: 'move' | 'nw' | 'ne' | 'sw' | 'se'
    startX: number
    startY: number
    orig: { x: number; y: number; w: number; h: number }
  } | null>(null)

  // 计算图片在舞台中 contain 后的显示矩形，并初始化裁剪框
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const img = new Image()
    img.onload = () => {
      const sw = stage.clientWidth
      const sh = stage.clientHeight
      const scale = Math.min(sw / img.naturalWidth, sh / img.naturalHeight)
      const w = img.naturalWidth * scale
      const h = img.naturalHeight * scale
      const x = (sw - w) / 2
      const y = (sh - h) / 2
      const rect = { x, y, w, h }
      setImgRect(rect)

      // 初始裁剪框：在图片内尽量大、居中、符合 aspect
      let cw = w
      let ch = cw / aspect
      if (ch > h) { ch = h; cw = ch * aspect }
      const cx = x + (w - cw) / 2
      const cy = y + (h - ch) / 2
      setCrop({ x: cx, y: cy, w: cw, h: ch })
    }
    img.src = src
  }, [src, aspect])

  const onPointerDown = (
    e: React.PointerEvent,
    mode: 'move' | 'nw' | 'ne' | 'sw' | 'se',
  ) => {
    if (!crop) return
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, orig: { ...crop } }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d || !crop || !imgRect) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    const minSize = 40
    let next = { ...d.orig }

    if (d.mode === 'move') {
      next.x = clamp(d.orig.x + dx, imgRect.x, imgRect.x + imgRect.w - d.orig.w)
      next.y = clamp(d.orig.y + dy, imgRect.y, imgRect.y + imgRect.h - d.orig.h)
    } else {
      // 缩放：保持 aspect，以对角为锚点
      // 取水平 delta 作为主驱动
      const right = d.orig.x + d.orig.w
      const bottom = d.orig.y + d.orig.h
      if (d.mode === 'se') {
        let w = clamp(d.orig.w + dx, minSize, imgRect.x + imgRect.w - d.orig.x)
        let h = w / aspect
        if (d.orig.y + h > imgRect.y + imgRect.h) { h = imgRect.y + imgRect.h - d.orig.y; w = h * aspect }
        next = { x: d.orig.x, y: d.orig.y, w, h }
      } else if (d.mode === 'sw') {
        let w = clamp(d.orig.w - dx, minSize, right - imgRect.x)
        let h = w / aspect
        if (d.orig.y + h > imgRect.y + imgRect.h) { h = imgRect.y + imgRect.h - d.orig.y; w = h * aspect }
        next = { x: right - w, y: d.orig.y, w, h }
      } else if (d.mode === 'ne') {
        let w = clamp(d.orig.w + dx, minSize, imgRect.x + imgRect.w - d.orig.x)
        let h = w / aspect
        if (bottom - h < imgRect.y) { h = bottom - imgRect.y; w = h * aspect }
        next = { x: d.orig.x, y: bottom - h, w, h }
      } else { // nw
        let w = clamp(d.orig.w - dx, minSize, right - imgRect.x)
        let h = w / aspect
        if (bottom - h < imgRect.y) { h = bottom - imgRect.y; w = h * aspect }
        next = { x: right - w, y: bottom - h, w, h }
      }
    }
    setCrop(next)
  }

  const onPointerUp = () => { dragRef.current = null }

  const handleConfirm = async () => {
    if (!crop || !imgRect || busy) return
    setBusy(true)
    try {
      // 把舞台像素裁剪框换算成相对原图的归一化比例
      const nx = (crop.x - imgRect.x) / imgRect.w
      const ny = (crop.y - imgRect.y) / imgRect.h
      const nw = crop.w / imgRect.w
      const nh = crop.h / imgRect.h
      const out = await cropDataUrl(src, {
        x: clamp01(nx), y: clamp01(ny),
        width: clamp01(nw), height: clamp01(nh),
      }, 1080, 0.85)
      onConfirm(out)
    } catch {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="h-header-safe flex items-center justify-between px-4 text-white shrink-0">
        <button onClick={onCancel} className="text-[15px]">取消</button>
        <span className="text-[15px]">拖动 / 缩放选定背景区域</span>
        <button onClick={handleConfirm} disabled={busy} className="text-[15px] text-wechat-green disabled:opacity-50">
          {busy ? '处理中…' : '确定'}
        </button>
      </div>
      <div
        ref={stageRef}
        className="flex-1 relative overflow-hidden touch-none"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {imgRect && (
          <img
            src={src}
            alt="裁剪预览"
            draggable={false}
            className="absolute select-none pointer-events-none"
            style={{ left: imgRect.x, top: imgRect.y, width: imgRect.w, height: imgRect.h }}
          />
        )}
        {crop && imgRect && (
          <>
            {/* 暗化遮罩四块（裁剪框外） */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute bg-black/60" style={{ left: 0, top: 0, right: 0, height: crop.y }} />
              <div className="absolute bg-black/60" style={{ left: 0, top: crop.y + crop.h, right: 0, bottom: 0 }} />
              <div className="absolute bg-black/60" style={{ left: 0, top: crop.y, width: crop.x, height: crop.h }} />
              <div className="absolute bg-black/60" style={{ left: crop.x + crop.w, top: crop.y, right: 0, height: crop.h }} />
            </div>
            {/* 裁剪框 */}
            <div
              className="absolute border-2 border-white box-border cursor-move"
              style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h }}
              onPointerDown={(e) => onPointerDown(e, 'move')}
            >
              {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                <span
                  key={corner}
                  onPointerDown={(e) => onPointerDown(e, corner)}
                  className="absolute w-5 h-5 bg-white rounded-full border border-gray-400"
                  style={cornerStyle(corner)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function cornerStyle(corner: 'nw' | 'ne' | 'sw' | 'se'): React.CSSProperties {
  const off = -10
  const base: React.CSSProperties = { touchAction: 'none' }
  if (corner === 'nw') return { ...base, left: off, top: off, cursor: 'nwse-resize' }
  if (corner === 'ne') return { ...base, right: off, top: off, cursor: 'nesw-resize' }
  if (corner === 'sw') return { ...base, left: off, bottom: off, cursor: 'nesw-resize' }
  return { ...base, right: off, bottom: off, cursor: 'nwse-resize' }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}
function clamp01(v: number) {
  return Math.max(0, Math.min(1, v))
}