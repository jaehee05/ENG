import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from 'firebase/storage'
import { storage } from './firebase'

export interface MockExplanationPdf {
  url: string
  name: string
  path: string
}

/** 파일명에서 Storage 경로에 부적합한 문자를 정리. */
function sanitizeFileName(name: string): string {
  const trimmed = name.trim().replace(/[/\\]/g, '_')
  return trimmed.length > 0 ? trimmed : 'explanation.pdf'
}

/**
 * 모의고사 해설 PDF 를 Storage 에 업로드하고 다운로드 정보를 반환.
 * 경로: mock-explanations/{mockId}/{timestamp}-{safeName}
 * (Date.now() 로 경로를 유니크하게 만들어 이전 업로드와 캐시 충돌 방지.)
 */
export async function uploadMockExplanationPdf(
  mockId: string,
  file: File,
): Promise<MockExplanationPdf> {
  if (file.type !== 'application/pdf') {
    throw new Error('PDF 파일만 업로드할 수 있습니다.')
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('PDF 파일 크기는 10MB 이하여야 합니다.')
  }
  const safeName = sanitizeFileName(file.name)
  const path = `mock-explanations/${mockId}/${Date.now()}-${safeName}`
  const objectRef = ref(storage, path)
  await uploadBytes(objectRef, file, { contentType: 'application/pdf' })
  const url = await getDownloadURL(objectRef)
  return { url, name: file.name, path }
}

/** Storage 에서 해설 PDF 삭제. 이미 없는 경우(404)는 무시. */
export async function deleteMockExplanationPdf(path: string): Promise<void> {
  try {
    await deleteObject(ref(storage, path))
  } catch (err) {
    // 파일이 이미 없으면 성공으로 간주.
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: string }).code === 'storage/object-not-found'
    ) {
      return
    }
    throw err
  }
}
