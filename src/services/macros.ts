import type { Character, UserPersona } from '../types'

export interface MacroContext {
  character?: Character
  userPersona: UserPersona
  virtualNow: number
}

/**
 * 替换文本中的 {{xxx}} 宏。
 * 不识别的宏保持原样（方便用户察觉自己写错了）。
 */
export function applyMacros(text: string, ctx: MacroContext): string {
  if (!text) return ''
  return text.replace(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g, (whole, key: string) => {
    const value = resolveMacro(key.toLowerCase(), ctx)
    return value !== null ? value : whole
  })
}

function resolveMacro(key: string, ctx: MacroContext): string | null {
  const { character, userPersona, virtualNow } = ctx
  const d = new Date(virtualNow)

  switch (key) {
    // 角色相关
    case 'char':
    case 'char_name':
      return character?.name || ''
    case 'description':
    case 'char_description':
      return character?.description || ''
    case 'personality':
    case 'char_personality':
      return character?.personality || ''
    case 'scenario':
    case 'char_scenario':
      return character?.scenario || ''

    // 用户相关
    case 'user':
    case 'user_name':
      return userPersona.name || '用户'
    case 'persona':
    case 'user_persona':
      return userPersona.description || ''

    // 时间相关
    case 'datetime':
      return formatFullDateTime(d)
    case 'date':
      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
    case 'time':
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`
    case 'weekday': {
      const w = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
      return w[d.getDay()]
    }
    case 'time_of_day': {
      const h = d.getHours()
      if (h < 5) return '凌晨'
      if (h < 9) return '早上'
      if (h < 12) return '上午'
      if (h < 14) return '中午'
      if (h < 18) return '下午'
      if (h < 22) return '晚上'
      return '深夜'
    }

    default:
      return null
  }
}

function pad(n: number): string { return n.toString().padStart(2, '0') }

function formatFullDateTime(d: Date): string {
  const w = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${w[d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
