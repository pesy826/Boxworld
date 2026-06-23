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

/** 把 dataURL 加载为 image（供裁剪用） */
export function loadImageFromUrl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = (e) => reject(e)
    img.src = src
  })
}

/**
 * 把 dataURL 按归一化裁剪区域（0~1，相对原图）裁出并压缩为 JPEG dataURL。
 * @param src        原图 dataURL
 * @param crop       裁剪区域（x/y/width/height 均为 0~1 比例）
 * @param outWidth   输出宽度像素（高按裁剪区域宽高比算）
 * @param quality    JPEG 质量
 */
export async function cropDataUrl(
  src: string,
  crop: { x: number; y: number; width: number; height: number },
  outWidth = 1080,
  quality = 0.85,
): Promise<string> {
  const img = await loadImageFromUrl(src)
  const sx = Math.max(0, Math.round(crop.x * img.naturalWidth))
  const sy = Math.max(0, Math.round(crop.y * img.naturalHeight))
  const sw = Math.max(1, Math.round(crop.width * img.naturalWidth))
  const sh = Math.max(1, Math.round(crop.height * img.naturalHeight))

  const targetW = Math.min(outWidth, sw)
  const targetH = Math.round((sh / sw) * targetW)

  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 不可用')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, targetW, targetH)
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH)
  return canvas.toDataURL('image/jpeg', quality)
}

/** 把 File 读成原始 dataURL（不压缩；供裁剪预览用） */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
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
