/**
 * 从 PNG 的二进制数据中提取所有 tEXt 块。
 *
 * PNG 文件结构：
 * - 8 字节签名：89 50 4E 47 0D 0A 1A 0A
 * - 之后是若干个块（chunk），每个块结构：
 *   [4 字节长度][4 字节类型][N 字节数据][4 字节 CRC]
 * - tEXt 块的数据是 "keyword\0text"
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export interface PngTextChunk {
  keyword: string
  text: string
}

export function extractPngTextChunks(buffer: ArrayBuffer): PngTextChunk[] {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  // 校验 PNG 签名
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) {
      throw new Error('不是合法的 PNG 文件')
    }
  }

  const chunks: PngTextChunk[] = []
  let offset = 8

  while (offset < bytes.length) {
    const length = view.getUint32(offset, false)
    offset += 4
    const type = String.fromCharCode(
      bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3],
    )
    offset += 4

    if (type === 'tEXt') {
      const chunkData = bytes.subarray(offset, offset + length)
      // tEXt: keyword\0text（keyword 是 Latin-1，text 也是 Latin-1）
      let nullPos = -1
      for (let i = 0; i < chunkData.length; i++) {
        if (chunkData[i] === 0) { nullPos = i; break }
      }
      if (nullPos > 0) {
        const keyword = bytesToLatin1(chunkData.subarray(0, nullPos))
        const text = bytesToLatin1(chunkData.subarray(nullPos + 1))
        chunks.push({ keyword, text })
      }
    }

    offset += length + 4 // 跳过数据 + CRC

    if (type === 'IEND') break
  }

  return chunks
}

function bytesToLatin1(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return s
}

/**
 * 把整个 PNG 文件转成 base64 dataURL，用于做头像。
 */
export function pngToDataUrl(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize)) as any,
    )
  }
  return 'data:image/png;base64,' + btoa(binary)
}
