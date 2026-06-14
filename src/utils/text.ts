/**
 * 文本清洗工具。
 */

/**
 * 解码常见 HTML 实体（&quot; &amp; &lt; &gt; &#39; &nbsp; 及数字实体）。
 * 角色卡导入、AI 生成的人设里常混入 &quot; 这类未解码实体，统一在写入/显示前清掉。
 */
export function decodeHtmlEntities(input: string): string {
  if (!input || input.indexOf('&') < 0) return input
  return input
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    // 数字实体 &#123; / &#x1F600;
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => safeFromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeFromCodePoint(parseInt(dec, 10)))
    // &amp; 放最后，避免把已解码内容里的 & 再次误伤
    .replace(/&amp;/g, '&')
}

function safeFromCodePoint(cp: number): string {
  try {
    if (cp >= 0 && cp <= 0x10ffff) return String.fromCodePoint(cp)
  } catch { /* noop */ }
  return ''
}

/**
 * 容错解析 JSON。
 * 先尝试标准 JSON.parse；失败时认为是模型在字符串值内部塞了未转义的裸双引号
 * （如 `"relation": "...裴振山的"交租"竞争对手"`），破坏了 JSON 结构。
 * 修复策略：逐字符扫描，识别"已进入字符串值"的状态，把字符串内部多余的裸双引号
 * 替换成中文引号「”」（不影响合法的结构性引号、转义引号、键名引号），再重新 parse。
 * 解析仍失败则返回 null。
 */
export function tryParseJsonLoose(text: string): any {
  try {
    return JSON.parse(text)
  } catch { /* 继续尝试修复 */ }
  try {
    const repaired = repairBareQuotes(text)
    return JSON.parse(repaired)
  } catch {
    return null
  }
}

/**
 * 把 JSON 字符串值内部的裸双引号转成中文引号，避免破坏结构。
 * 通过状态机判断：当处于一个字符串值内部时，若遇到一个双引号，但它后面跟的不是
 * 合法的结构字符（: , } ] 或行尾/空白后接这些），则判定为内部裸引号 → 替换。
 */
function repairBareQuotes(text: string): string {
  const out: string[] = []
  let inString = false
  let escaped = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (escaped) {
      out.push(ch)
      escaped = false
      continue
    }
    if (ch === '\\') {
      out.push(ch)
      escaped = true
      continue
    }
    if (ch === '"') {
      if (!inString) {
        inString = true
        out.push(ch)
        continue
      }
      // 已在字符串内部，遇到双引号：判断它是否为该字符串的合法结束引号。
      // 向后跳过空白，看下一个有意义字符是否为结构字符。
      let j = i + 1
      while (j < text.length && /\s/.test(text[j])) j++
      const next = text[j]
      if (next === undefined || next === ':' || next === ',' || next === '}' || next === ']') {
        // 合法结束引号
        inString = false
        out.push(ch)
      } else {
        // 内部裸引号 → 中文引号，不破坏结构
        out.push('”')
      }
      continue
    }
    out.push(ch)
  }
  return out.join('')
}
