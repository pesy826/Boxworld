import type { ReactNode } from 'react'

/** 设置项的一行容器 */
export function SettingRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="px-4 py-3 border-b border-wechat-divider last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[14px] shrink-0">{label}</div>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
      {hint && <div className="text-[12px] text-wechat-textGray mt-1">{hint}</div>}
    </div>
  )
}

/** 设置区块（一组 Row 的卡片） */
export function SettingSection({
  title,
  children,
}: {
  title?: string
  children: ReactNode
}) {
  return (
    <div className="mt-3 px-3">
      {title && (
        <div className="px-1 pb-1.5 text-[13px] font-semibold text-wechat-textGray">{title}</div>
      )}
      <div className="bg-white rounded-xl border border-wechat-divider overflow-hidden shadow-sm">
        {children}
      </div>
    </div>
  )
}
