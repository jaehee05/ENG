import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import {
  deleteAccount,
  listAccounts,
  setAccountPassword,
  setAccountStatus,
} from '../lib/account'
import type { UserAccount, UserStatus } from '../lib/types'

const STATUS_LABEL: Record<UserStatus, string> = {
  pending: '승인 대기',
  active: '활성',
  rejected: '거부',
}

const STATUS_CLASS: Record<UserStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  active: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-slate-200 text-slate-600',
}

function fmt(ts: UserAccount['createdAt']): string {
  if (!ts) return ''
  const d = ts.toDate()
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export function AdminStudents() {
  const { profile } = useAuth()
  const [accounts, setAccounts] = useState<UserAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setAccounts(await listAccounts())
    } catch (e) {
      setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    listAccounts()
      .then((list) => {
        if (!cancelled) setAccounts(list)
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function changeStatus(id: string, status: UserStatus) {
    await setAccountStatus(id, status)
    load()
  }

  async function changePassword(id: string) {
    const pw = window.prompt('새 비밀번호를 입력하세요')
    if (!pw) return
    await setAccountPassword(id, pw)
    load()
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`${name} 님의 계정을 정말 삭제하시겠습니까?`)) return
    await deleteAccount(id)
    load()
  }

  function toggleReveal(id: string) {
    setRevealed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const others = accounts.filter((a) => a.id !== profile?.id)
  const me = accounts.find((a) => a.id === profile?.id)
  const pending = others.filter((a) => a.status === 'pending').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">학생 관리</h1>
        <p className="text-sm text-slate-500 mt-1">
          전체 {accounts.length}명 · 승인 대기 {pending}명
        </p>
      </div>

      {loading && <p className="text-slate-500 text-sm">불러오는 중...</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {me && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4 text-sm text-slate-700">
          <span className="font-medium">{me.displayName}</span>
          <span className="text-slate-500"> · {me.email}</span>
          <span className="ml-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
            나 (관리자)
          </span>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">이름</th>
              <th className="px-4 py-3 text-left font-semibold">학교</th>
              <th className="px-4 py-3 text-left font-semibold">학생 연락처</th>
              <th className="px-4 py-3 text-left font-semibold">학부모 연락처</th>
              <th className="px-4 py-3 text-left font-semibold">이메일</th>
              <th className="px-4 py-3 text-left font-semibold">비밀번호</th>
              <th className="px-4 py-3 text-left font-semibold">상태</th>
              <th className="px-4 py-3 text-left font-semibold">가입일</th>
              <th className="px-4 py-3 text-left font-semibold">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {others.length === 0 && !loading && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  아직 가입한 학생이 없습니다.
                </td>
              </tr>
            )}
            {others.map((a) => {
              const open = revealed.has(a.id)
              return (
                <tr key={a.id}>
                  <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                    <Link to={`/admin/students/${a.id}`} className="hover:underline">
                      {a.displayName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{a.school || '-'}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{a.phone || '-'}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{a.parentPhone || '-'}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{a.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-slate-100 px-2 py-1 rounded font-mono">
                        {open ? a.password ?? '' : '••••••'}
                      </code>
                      <button
                        onClick={() => toggleReveal(a.id)}
                        className="text-xs text-slate-500 hover:text-slate-900"
                      >
                        {open ? '숨기기' : '보기'}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[a.status]}`}>
                      {STATUS_LABEL[a.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{fmt(a.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1">
                      {a.status !== 'active' && (
                        <button
                          onClick={() => changeStatus(a.id, 'active')}
                          className="rounded bg-emerald-600 text-white text-xs font-medium px-2 py-1 hover:bg-emerald-700"
                        >
                          승인
                        </button>
                      )}
                      {a.status !== 'rejected' && (
                        <button
                          onClick={() => changeStatus(a.id, 'rejected')}
                          className="rounded bg-slate-200 text-slate-700 text-xs font-medium px-2 py-1 hover:bg-slate-300"
                        >
                          거부
                        </button>
                      )}
                      <button
                        onClick={() => changePassword(a.id)}
                        className="rounded border border-slate-300 text-slate-700 text-xs font-medium px-2 py-1 hover:bg-slate-100"
                      >
                        비번 변경
                      </button>
                      <button
                        onClick={() => remove(a.id, a.displayName)}
                        className="rounded text-red-600 text-xs font-medium px-2 py-1 hover:bg-red-50"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
