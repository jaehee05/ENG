import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getKoreanMock } from '../lib/firestore'
import { PdfViewer } from '../components/PdfViewer'
import type { KoreanMock } from '../lib/types'

/**
 * 해설 PDF 전용 전체화면 라우트. 오버레이가 아니라 별도 화면이라
 * 닫으면 navigate(-1) 로 직전 화면(학생=결과, 관리자=상세)으로 되돌아가고,
 * 무거운 PDF DOM 도 완전히 해제된다.
 */
export function KoreanMockExplanation() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [mock, setMock] = useState<KoreanMock | null>(null)

  const close = () => navigate(-1)

  useEffect(() => {
    if (!id) return
    let alive = true
    getKoreanMock(id)
      .then((m) => {
        if (!alive) return
        // 해설이 없으면 볼 게 없으니 이전 화면으로.
        if (!m?.explanationPdfUrl) navigate(-1)
        else setMock(m)
      })
      .catch(() => {
        if (alive) navigate(-1)
      })
    return () => {
      alive = false
    }
  }, [id, navigate])

  if (!mock?.explanationPdfUrl) return null

  return (
    <PdfViewer
      url={mock.explanationPdfUrl}
      title={mock.explanationPdfName ?? '해설'}
      onClose={close}
    />
  )
}
