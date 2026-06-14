import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTourStore, needsWelcome, type TourDef } from '../stores/tourStore'

/**
 * 游戏式新手指引：
 * - 聚光灯遮罩（四块半透明黑遮罩拼出高亮洞口 + 高亮描边脉冲）
 * - 提示卡片自动定位在高亮元素上方/下方
 * - 无 target 的步骤显示居中说明卡
 * - 每一步均可"跳过本教程"，不强制
 */

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

const PAD = 6

export default function TourOverlay() {
  const active = useTourStore((s) => s.active)
  const next = useTourStore((s) => s.next)
  const skipCurrent = useTourStore((s) => s.skipCurrent)

  const step = active ? active.def.steps[active.index] : null
  const [rect, setRect] = useState<Rect | null>(null)
  const rafRef = useRef<number>(0)

  // 定位高亮元素（轮询跟踪：滚动/布局变化时跟随）
  useLayoutEffect(() => {
    if (!step) { setRect(null); return }
    if (!step.target) { setRect(null); return }

    let cancelled = false
    const track = () => {
      if (cancelled) return
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
      if (el) {
        const r = el.getBoundingClientRect()
        setRect((prev) => {
          if (prev && Math.abs(prev.top - r.top) < 1 && Math.abs(prev.left - r.left) < 1
            && Math.abs(prev.width - r.width) < 1 && Math.abs(prev.height - r.height) < 1) {
            return prev
          }
          return { top: r.top, left: r.left, width: r.width, height: r.height }
        })
        // 不在视口内则滚动出来
        if (r.top < 0 || r.bottom > window.innerHeight) {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
      } else {
        setRect(null)
      }
      rafRef.current = requestAnimationFrame(track)
    }
    track()
    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
    }
  }, [step])

  if (!active || !step) return null

  const total = active.def.steps.length
  const indexLabel = `${active.index + 1}/${total}`
  const isLast = active.index === total - 1

  // 高亮区（带 padding）
  const hole = rect
    ? {
      top: Math.max(0, rect.top - PAD),
      left: Math.max(0, rect.left - PAD),
      width: rect.width + PAD * 2,
      height: rect.height + PAD * 2,
    }
    : null

  // 步骤要求点击目标本身：洞口区域可穿透点击，点击后自动 next
  const clickThrough = !!step.advanceOnClick && !!hole

  const handleHoleClick = () => {
    if (!clickThrough) return
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
    el?.click()
    next()
  }

  return (
    <div className="fixed inset-0 z-[999]" style={{ pointerEvents: 'none' }}>
      {/* 遮罩：有洞口时拼四块，无洞口时整屏 */}
      {hole ? (
        <>
          <Mask style={{ top: 0, left: 0, right: 0, height: hole.top }} />
          <Mask style={{ top: hole.top, left: 0, width: hole.left, height: hole.height }} />
          <Mask style={{ top: hole.top, left: hole.left + hole.width, right: 0, height: hole.height }} />
          <Mask style={{ top: hole.top + hole.height, left: 0, right: 0, bottom: 0 }} />
          {/* 高亮描边 */}
          <div
            className="absolute rounded-lg border-2 border-wechat-green animate-pulse"
            style={{
              top: hole.top, left: hole.left, width: hole.width, height: hole.height,
              boxShadow: '0 0 12px rgba(7,193,96,0.6)',
              pointerEvents: clickThrough ? 'none' : 'auto',
            }}
          />
          {clickThrough && (
            <div
              className="absolute"
              style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height, pointerEvents: 'auto', cursor: 'pointer' }}
              onClick={handleHoleClick}
            />
          )}
          {/* 指示箭头 */}
          <Arrow hole={hole} />
        </>
      ) : (
        <Mask style={{ inset: 0 }} />
      )}

      {/* 提示卡片 */}
      <TipCard
        hole={hole}
        title={step.title}
        content={step.content}
        indexLabel={total > 1 ? indexLabel : ''}
        nextLabel={isLast ? '完成' : '下一步'}
        onNext={next}
        onSkip={skipCurrent}
      />
    </div>
  )
}

function Mask({ style }: { style: React.CSSProperties }) {
  return (
    <div
      className="absolute bg-black/60"
      style={{ ...style, pointerEvents: 'auto' }}
    />
  )
}

/** 朝向高亮区的弹跳箭头 */
function Arrow({ hole }: { hole: Rect }) {
  const below = hole.top + hole.height + 160 < window.innerHeight
  const x = hole.left + hole.width / 2
  if (below) {
    // 卡片在下方 → 箭头在洞口下沿指向上
    return (
      <div
        className="absolute text-wechat-green animate-bounce select-none"
        style={{ top: hole.top + hole.height + 4, left: x - 10, fontSize: 20, pointerEvents: 'none' }}
      >
        ⬆
      </div>
    )
  }
  return (
    <div
      className="absolute text-wechat-green animate-bounce select-none"
      style={{ top: hole.top - 30, left: x - 10, fontSize: 20, pointerEvents: 'none' }}
    >
      ⬇
    </div>
  )
}

function TipCard({
  hole, title, content, indexLabel, nextLabel, onNext, onSkip,
}: {
  hole: Rect | null
  title: string
  content: string
  indexLabel: string
  nextLabel: string
  onNext: () => void
  onSkip: () => void
}) {
  // 卡片位置：高亮区下方放得下就放下方，否则上方；无高亮居中
  const style: React.CSSProperties = { pointerEvents: 'auto' }
  if (hole) {
    const below = hole.top + hole.height + 180 < window.innerHeight
    if (below) {
      style.top = hole.top + hole.height + 34
    } else {
      style.bottom = window.innerHeight - hole.top + 34
    }
    style.left = '50%'
    style.transform = 'translateX(-50%)'
  } else {
    style.top = '50%'
    style.left = '50%'
    style.transform = 'translate(-50%, -50%)'
  }

  return (
    <div
      className="absolute w-[300px] max-w-[85vw] bg-white rounded-xl shadow-2xl p-4"
      style={style}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[15px] font-semibold">{title}</div>
        {indexLabel && <div className="text-[11px] text-wechat-textGray">{indexLabel}</div>}
      </div>
      <div className="text-[13px] text-gray-600 leading-relaxed whitespace-pre-wrap">{content}</div>
      <div className="flex items-center justify-between mt-3">
        <button
          onClick={onSkip}
          className="text-[12px] text-wechat-textGray px-2 py-1.5"
        >
          跳过本教程
        </button>
        <button
          onClick={onNext}
          className="px-4 py-1.5 bg-wechat-green text-white rounded-full text-[13px]"
        >
          {nextLabel}
        </button>
      </div>
    </div>
  )
}

// ==================== 首次启动欢迎弹窗 ====================

export function WelcomeDialog() {
  const pref = useTourStore((s) => s.pref)
  const setPref = useTourStore((s) => s.setPref)
  const [visible, setVisible] = useState(() => needsWelcome())

  useEffect(() => {
    if (pref !== 'unset') setVisible(false)
  }, [pref])

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[1000] bg-black/60 flex items-center justify-center p-6">
      <div className="w-full max-w-[320px] bg-white rounded-2xl p-6 text-center">
        <div className="text-[40px] mb-2">📦</div>
        <div className="text-[18px] font-semibold mb-2">欢迎来到盒世界</div>
        <div className="text-[13px] text-gray-600 leading-relaxed mb-5">
          这是一个角色拥有"自己生活"的 AI 聊天世界：
          微信式聊天、朋友圈、群聊、线下场景扮演、独立时间线……
          <br /><br />
          需要新手指引吗？每个功能页面第一次打开时会有简短的引导说明，随时可跳过。
        </div>
        <div className="space-y-2">
          <button
            onClick={() => setPref('on')}
            className="w-full py-2.5 bg-wechat-green text-white rounded-lg text-[14px]"
          >
            开启新手指引（推荐）
          </button>
          <button
            onClick={() => setPref('off')}
            className="w-full py-2.5 text-wechat-textGray text-[13px]"
          >
            跳过教程，我自己探索
          </button>
        </div>
      </div>
    </div>
  )
}

// ==================== 页面触发 Hook ====================

/**
 * 页面挂载时尝试启动该页教程（仅第一次进入 + 用户开启了指引时生效）。
 * delay 给页面渲染留时间，确保锚点元素已存在。
 */
export function usePageTour(def: TourDef, delay = 400) {
  const maybeStart = useTourStore((s) => s.maybeStart)
  useEffect(() => {
    const timer = setTimeout(() => maybeStart(def), delay)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.id])
}