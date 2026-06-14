/**
 * 把 File 压缩为 dataURL。
 * - 最长边限制为 maxSize（默认 1024）
 * - JPEG 质量 quality（默认 0.85）
 */
export async function fileToCompressedDataUrl(
  file: File,
  maxSize = 1024,
  quality = 0.85,
): Promise<string> {
  // 读为 image
  const img = await loadImage(file)

  // 计算目标尺寸
  let { width, height } = img
  if (width > maxSize || height > maxSize) {
    if (width >= height) {
      height = Math.round((height / width) * maxSize)
      width = maxSize
    } else {
      width = Math.round((width / height) * maxSize)
      height = maxSize
    }
  }

  // 画到 canvas 输出 JPEG
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 不可用')
  ctx.fillStyle = '#fff' // PNG 透明背景填白
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)

  return canvas.toDataURL('image/jpeg', quality)
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = (e) => reject(e)
      img.src = String(reader.result)
    }
    reader.onerror = (e) => reject(e)
    reader.readAsDataURL(file)
  })
}

/** dataURL 大致字节数（base64 长度 × 3/4） */
export function estimateDataUrlBytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',')
  if (commaIdx < 0) return dataUrl.length
  return Math.floor((dataUrl.length - commaIdx - 1) * 0.75)
}
