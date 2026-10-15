interface ResizedImage {
  base64: string
  mediaType: 'image/jpeg' | 'image/png'
  width: number
  height: number
  byteSize: number
  /** withPixels 일 때만 — 보낸 JPEG 를 다시 푼 픽셀(OMR 칸 판독용). */
  pixels?: ImageData
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

/**
 * 긴 변을 maxDimension 이하로, (주면) 전체 픽셀 수를 maxPixels 이하로 줄여 JPEG 로 만든다.
 *
 * maxPixels 가 따로 있는 건 Claude 의 이미지 한도가 긴 변(2576px)과 면적(약 3.75MP)
 * 둘 다라서다. 4:3 사진을 긴 변만 맞춰 줄이면 면적이 한도를 넘어 서버에서 다시
 * 줄어든다 — OMR 처럼 칸이 작은 사진은 그 한 번이 판독을 망칠 수 있다.
 */
export async function resizeImageForUpload(
  file: File,
  maxDimension = MAX_DIMENSION,
  maxPixels = Infinity,
  quality = JPEG_QUALITY,
  withPixels = false,
): Promise<ResizedImage> {
  const dataUrl = await readFileAsDataURL(file)
  const img = await loadImage(dataUrl)
  const { width: w0, height: h0 } = img
  const scale = Math.min(
    1,
    maxDimension / Math.max(w0, h0),
    Math.sqrt(maxPixels / (w0 * h0)),
  )
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
  const out = canvas.toDataURL('image/jpeg', quality)
  const base64 = out.includes(',') ? out.split(',')[1] : out
  // 서버가 짚은 좌표는 보낸 JPEG 기준이라, 캔버스 원본이 아니라 압축을 거친 그
  // 이미지를 다시 풀어 읽는다 — 두 쪽이 같은 픽셀을 보게.
  let pixels: ImageData | undefined
  if (withPixels) {
    const sent = await loadImage(out)
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(sent, 0, 0, w, h)
    pixels = ctx.getImageData(0, 0, w, h)
  }
  return {
    pixels,
    base64,
    mediaType: 'image/jpeg',
    width: w,
    height: h,
    byteSize: Math.floor((base64.length * 3) / 4),
  }
}
