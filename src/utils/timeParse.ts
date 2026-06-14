/**
 * 从用户输入文本里解析"时间推进"意图，返回推进的毫秒数。
 * 纯正则匹配常见中文时间表达，不调 API。
 * 解析不到返回 0。
 */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// 中文数字转阿拉伯数字（支持 一~十、两、半 等简单情况）
function cnNumToInt(s: string): number {
  const map: Record<string, number> = {
    一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
    六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  }
  if (/^\d+$/.test(s)) return parseInt(s, 10)
  if (s === '半') return 0  // "半" 单独处理
  // 处理 "十X" "X十" "X十X"
  if (s.includes('十')) {
    const parts = s.split('十')
    const tens = parts[0] ? (map[parts[0]] || 0) : 1
    const ones = parts[1] ? (map[parts[1]] || 0) : 0
    return tens * 10 + ones
  }
  return map[s] || 0
}

interface ParseResult {
  advanceMs: number
  /** 匹配到的原文片段（用于提示用户） */
  matchedText: string | null
}

export function parseTimeAdvance(text: string): ParseResult {
  if (!text) return { advanceMs: 0, matchedText: null }

  const num = '(\\d+|[一二两三四五六七八九十]+|半)'

  // 各种模式，按优先级从具体到模糊
  const patterns: Array<{ re: RegExp; toMs: (n: number, raw: string) => number }> = [
    // 第N天 / 第二天 / 次日 / 翌日
    { re: /第\s*([一二两三四五六七八九十\d]+)\s*天/, toMs: (n) => Math.max(1, n - 1) * DAY },
    { re: /(次日|翌日|第二天|隔天)/, toMs: () => DAY },

    // N天后 / N天之后
    { re: new RegExp(num + '\\s*天\\s*(之?后|过后)?'), toMs: (n, raw) => (raw.includes('半') ? 0.5 : n) * DAY },

    // N小时后 / N个小时后
    { re: new RegExp(num + '\\s*(个)?\\s*(小时|钟头)\\s*(之?后|过后)?'), toMs: (n, raw) => (raw.includes('半') ? 0.5 : n) * HOUR },

    // 半小时 / 半个小时
    { re: /半\s*(个)?\s*(小时|钟头)/, toMs: () => 0.5 * HOUR },

    // N分钟后
    { re: new RegExp(num + '\\s*分钟?\\s*(之?后|过后)?'), toMs: (n, raw) => (raw.includes('半') ? 0.5 : n) * MINUTE },

    // 模糊表达
    { re: /(一整天|一天后|一天过后)/, toMs: () => DAY },
    { re: /(一上午|整个上午)/, toMs: () => 4 * HOUR },
    { re: /(一下午|整个下午|睡了一下午)/, toMs: () => 4 * HOUR },
    { re: /(一晚上|一整晚|一夜)/, toMs: () => 8 * HOUR },
    { re: /(聊到深夜|到了深夜|深夜)/, toMs: () => 4 * HOUR },
    { re: /(傍晚|黄昏)/, toMs: () => 3 * HOUR },
    { re: /(过了好一?会儿|过了一会儿|不一会儿|片刻之后|稍后)/, toMs: () => 20 * MINUTE },
    { re: /(过了一?阵子|没过多久)/, toMs: () => 30 * MINUTE },
  ]

  for (const p of patterns) {
    const m = text.match(p.re)
    if (m) {
      const numStr = m[1] || ''
      const n = numStr ? cnNumToInt(numStr) : 0
      const ms = p.toMs(n || 1, m[0])
      if (ms > 0) {
        return { advanceMs: Math.round(ms), matchedText: m[0] }
      }
    }
  }

  return { advanceMs: 0, matchedText: null }
}

/** 把毫秒数格式化成易读文字（用于提示） */
export function formatDuration(ms: number): string {
  if (ms >= DAY) {
    const d = ms / DAY
    return Number.isInteger(d) ? `${d} 天` : `${d.toFixed(1)} 天`
  }
  if (ms >= HOUR) {
    const h = ms / HOUR
    return Number.isInteger(h) ? `${h} 小时` : `${h.toFixed(1)} 小时`
  }
  const min = Math.round(ms / MINUTE)
  return `${min} 分钟`
}
