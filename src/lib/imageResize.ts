interface ResizedImage {
  base64: string
  mediaType: 'image/jpeg' | 'image/png'
  width: number
  height: number
  byteSize: number
}

const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.85

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('이미지를 디코드할 수 없습니다.'))
    img.src = url
  })
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'))
    reader.readAsDataURL(file)
  })
}

export async function resizeImageForUpload(file: File): Promise<ResizedImage> {
  const dataUrl = await readFileAsDataURL(file)
  const img = await loadImage(dataUrl)
  const { width: w0, height: h0 } = img
  const scale = Math.min(1, MAX_DIMENSION / Math.max(w0, h0))
  const w = Math.round(w0 * scale)
  const h = Math.round(h0 * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 컨텍스트를 만들 수 없습니다.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  const out = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  const base64 = out.includes(',') ? out.split(',')[1] : out
  return {
    base64,
    mediaType: 'image/jpeg',
    width: w,
    height: h,
    byteSize: Math.floor((base64.length * 3) / 4),
  }
}
