import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
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
  const location = useLocation()
  const [mock, setMock] = useState<KoreanMock | null>(null)

  // 히스토리 깊이에 의존하지 않도록, 열 때 넘겨받은 명시적 경로로 되돌아간다.
  // (없으면 뒤로가기로 폴백.)
  const from = (location.state as { from?: string } | null)?.from
  const close = () => {
    if (from) navigate(from, { replace: true })
    else navigate(-1)
  }

  useEffect(() => {
    if (!id) return
    let alive = true
    getKoreanMock(id)
      .then((m) => {
        if (!alive) return
        // 해설이 없으면 볼 게 없으니 이전 화면으로.
        if (!m?.explanationPdfUrl) close()
        else setMock(m)
      })
      .catch(() => {
        if (alive) close()
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!mock?.explanationPdfUrl) return null

  return (
    <PdfViewer
      url={mock.explanationPdfUrl}
      title={mock.explanationPdfName ?? '해설'}
      onClose={close}
    />
  )
}
