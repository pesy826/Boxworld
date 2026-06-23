/**
 * 黑夜模式主题应用工具。
 *
 * 策略：Tailwind darkMode='class' —— 给 <html> 加/去 `dark` class。
 * - light：移除 dark
 * - dark：添加 dark
 * - system：跟随系统 prefers-color-scheme，并监听其变化实时切换
 *
 * 启动时（main.tsx 读取 settings 后）调用 applyTheme(settings.theme)。
 */

export type ThemeMode = 'light' | 'dark' | 'system'

let mediaQuery: MediaQueryList | null = null
let mediaListener: ((e: MediaQueryListEvent) => void) | null = null

function setDarkClass(isDark: boolean) {
  const root = document.documentElement
  if (isDark) root.classList.add('dark')
  else root.classList.remove('dark')
}

function clearSystemListener() {
  if (mediaQuery && mediaListener) {
    mediaQuery.removeEventListener('change', mediaListener)
  }
  mediaQuery = null
  mediaListener = null
}

/** 应用主题；system 模式会跟随系统并实时监听切换 */
export function applyTheme(theme: ThemeMode | undefined) {
  clearSystemListener()
  const mode: ThemeMode = theme || 'system'

  if (mode === 'system') {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    setDarkClass(mediaQuery.matches)
    mediaListener = (e: MediaQueryListEvent) => setDarkClass(e.matches)
    mediaQuery.addEventListener('change', mediaListener)
    return
  }
  setDarkClass(mode === 'dark')
}