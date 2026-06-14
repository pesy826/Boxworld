import { useMemo } from 'react'

/**
 * 把场景叙事文本解析为带样式的片段：
 * - "双引号" 或 "中文引号" → 对白（蓝色）
 * - *星号* → 动作/心理（灰色斜体）
 * - 其他 → 旁白（默认色）
 */
export default function NarrativeText({ text }: { text: string }) {
  const segments = useMemo(() => parseSegments(text), [text])
  return (
    <div className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
      {segments.map((seg, i) => {
        if (seg.type === 'dialogue') {
          return <span key={i} className="text-sky-700">{seg.text}</span>
        }
        if (seg.type === 'action') {
          return <span key={i} className="text-stone-400 italic">{seg.text}</span>
        }
        return <span key={i} className="text-stone-700">{seg.text}</span>
      })}
    </div>
  )
}

type Segment = { type: 'dialogue' | 'action' | 'normal'; text: string }

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = []
  let i = 0
  let buffer = ''

  const flushNormal = () => {
    if (buffer) {
      segments.push({ type: 'normal', text: buffer })
      buffer = ''
    }
  }

  while (i < text.length) {
    const ch = text[i]

    // 对白：英文双引号 " 或 中文引号 "
    if (ch === '"' || ch === '\u201c') {
      const closeChar = ch === '"' ? '"' : '\u201d'
      // 找闭合
      let j = i + 1
      while (j < text.length && text[j] !== closeChar) j++
      if (j < text.length) {
        flushNormal()
        segments.push({ type: 'dialogue', text: text.slice(i, j + 1) })
        i = j + 1
        continue
      }
      // 没找到闭合，当普通字符
      buffer += ch
      i++
      continue
    }

    // 动作：*内容*
    if (ch === '*') {
      let j = i + 1
      while (j < text.length && text[j] !== '*') j++
      if (j < text.length && j > i + 1) {
        flushNormal()
        segments.push({ type: 'action', text: text.slice(i, j + 1) })
        i = j + 1
        continue
      }
      buffer += ch
      i++
      continue
    }

    buffer += ch
    i++
  }

  flushNormal()
  return segments
}
