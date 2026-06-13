import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { deleteVocabSet, getVocabSet, listAttemptsForUser } from '../lib/firestore'
import { MyAttemptsBox } from '../components/MyAttemptsBox'
import type { Attempt, VocabSet } from '../lib/types'

export function VocabDetail() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isAdmin = profile?.role === 'admin'
  const [set, setSet] = useState<VocabSet | null>(null)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!id || !profile) return
    Promise.all([getVocabSet(id), listAttemptsForUser(profile.id)])
      .then(([s, atts]) => {
        if (!s) setError('시험지를 찾을 수 없습니다.')
        else {
          setSet(s)
          setAttempts(atts)
        }
      })
      .catch((e) => setError(e.message ?? '불러오기 실패'))
      .finally(() => setLoading(false))
  }, [id, profile])

  const myAttempts = useMemo(
    () => attempts.filter((a) => a.type === 'vocab' && a.refId === id),
    [attempts, id],
  )

  async function handleDelete() {
    if (!set) return
    if (!window.confirm(`"${set.title}" 시험지를 삭제하시겠습니까?\n이 시험지의 학생 응시 기록은 그대로 남습니다.`))
      return
    setDeleting(true)
    try {
      await deleteVocabSet(set.id)
      navigate('/vocab')
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제 실패')
      setDeleting(false)
    }
  }

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!set) return null

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{set.title}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {set.words.length}단어 · {set.createdByName}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isAdmin && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-md border border-red-200 text-red-600 text-sm font-medium px-4 py-2 hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? '삭제 중...' : '삭제'}
            </button>
          )}
          <Link
            to={`/vocab/${set.id}/take`}
            className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 transition"
          >
            시험 시작
          </Link>
        </div>
      </div>

      {myAttempts.length > 0 && (
        <MyAttemptsBox
          attempts={myAttempts}
          buildResultPath={(a) => `/vocab/${set.id}/result/${a.id}`}
        />
      )}

      <ul className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
        {set.words.map((w, i) => (
          <li key={i} className="px-4 py-3 space-y-1.5">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-xs text-slate-400 w-6">{i + 1}.</span>
              <span className="font-semibold text-slate-900">{w.en}</span>
              <span className="text-slate-600">{w.ko}</span>
            </div>
            {w.definitionEn && (
              <p className="pl-9 text-sm text-slate-700">
                <span className="text-xs text-slate-400 mr-1">[영영]</span>
                {w.definitionEn}
              </p>
            )}
            {w.example && (
              <p className="pl-9 text-sm text-slate-700 italic">
                <span className="text-xs text-slate-400 not-italic mr-1">[예문]</span>
                {w.example}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
