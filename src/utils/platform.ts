/**
 * 平台检测工具。
 * ComfyUI 等"仅桌面端"功能用 isDesktop() 判断：
 * - Tauri 安卓打包（UA 含 Android）→ 移动端
 * - 手机浏览器 → 移动端
 * - Windows/macOS/Linux 的 Tauri 桌面或浏览器 → 桌面端
 */
export function isTauri(): boolean {
  if (typeof window === 'undefined') return false
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window
}

export function isMobileUA(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

/** 是否桌面端（ComfyUI 等本地服务功能仅在桌面端可用） */
export function isDesktop(): boolean {
  return !isMobileUA()
}