/**
 * 把时间戳格式化为人类可读字符串。
 * 用于聊天列表、朋友圈、消息时间等显示。
 */

const pad = (n: number) => n.toString().padStart(2, '0')

/** 完整：2026/06/08 14:32 */
export function formatFull(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 仅时间：14:32 */
export function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 仅日期：2026/06/08 */
export function formatDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
}

/**
 * 微信风格的相对时间显示（用于聊天列表）
 * - 今天：14:32
 * - 昨天：昨天
 * - 一周内：星期X
 * - 更早：2026/06/08
 */
export function formatRelative(ts: number, now: number): string {
  const d = new Date(ts)
  const n = new Date(now)
  const dayMs = 24 * 60 * 60 * 1000

  // 用日期（年月日）判断同一天
  const sameDay = d.toDateString() === n.toDateString()
  if (sameDay) return formatTime(ts)

  const yesterday = new Date(n.getTime() - dayMs)
  if (d.toDateString() === yesterday.toDateString()) return '昨天'

  const diffDays = Math.floor((n.getTime() - d.getTime()) / dayMs)
  if (diffDays < 7) {
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
    return weekdays[d.getDay()]
  }

  return formatDate(ts)
}

/** 把"分钟"转毫秒 */
export const minutes = (n: number) => n * 60 * 1000
/** 把"小时"转毫秒 */
export const hours = (n: number) => n * 60 * 60 * 1000
/** 把"天"转毫秒 */
export const days = (n: number) => n * 24 * 60 * 60 * 1000
