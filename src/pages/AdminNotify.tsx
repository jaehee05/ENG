import { useEffect, useMemo, useState } from 'react'
import { listAccounts } from '../lib/account'
import { listAssignmentsForStudent, listAttemptsForUser } from '../lib/firestore'
import type { Assignment, UserAccount } from '../lib/types'

interface StudentBundle {
  account: UserAccount
  assignments: Assignment[]
  completedKeys: Set<string>
}

function statusLines(b: StudentBundle): string[] {
  return b.assignments.map((a) => {
    const done = b.completedKeys.has(`${a.type}:${a.refId}`)
    return `▶ ${a.refTitle} - ${done ? '완료' : '미완료'}`
  })
}

function statusValue(b: StudentBundle): string {
  const lines = statusLines(b)
  return lines.length > 0 ? lines.join('\n') : '(부여된 과제가 없습니다)'
}

const TEMPLATE_PREVIEW = `2027 재희T 1:1 개인 과외
과제 현황 안내
[*이름*]님, 과제 현황 안내입니다.

[*1*]

[*2*]`

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

const LS_TEMPLATE_CODE = 'eng_notify_template_code'
const LS_MSG_TYPE = 'eng_notify_msg_type'
const LS_NOTICE = 'eng_notify_notice'

type MsgType = '기본형' | '이미지형' | '강조표기형' | '아이템리스트형'

const MSG_TYPES: MsgType[] = ['기본형', '이미지형', '강조표기형', '아이템리스트형']

export function AdminNotify() {
  const [bundles, setBundles] = useState<StudentBundle[]>([])
  const [templateCode, setTemplateCode] = useState(
    () => localStorage.getItem(LS_TEMPLATE_CODE) ?? '',
  )
  const [msgType, setMsgType] = useState<MsgType>(() => {
    const v = localStorage.getItem(LS_MSG_TYPE) as MsgType | null
    return v && MSG_TYPES.includes(v) ? v : '강조표기형'
  })
  const [notice, setNotice] = useState(
    () => localStorage.getItem(LS_NOTICE) ?? '',
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [hideCompleted, setHideCompleted] = useState(false)

  useEffect(() => {
    localStorage.setItem(LS_TEMPLATE_CODE, templateCode)
  }, [templateCode])
  useEffect(() => {
    localStorage.setItem(LS_MSG_TYPE, msgType)
  }, [msgType])
  useEffect(() => {
    localStorage.setItem(LS_NOTICE, notice)
  }, [notice])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const accounts = await listAccounts()
        const targets = accounts.filter(
          (a) => a.role === 'student' && a.status === 'active',
        )
        const bundles = await Promise.all(
          targets.map(async (account) => {
            const [assignments, attempts] = await Promise.all([
              listAssignmentsForStudent(account.id),
              listAttemptsForUser(account.id),
            ])
            const completedKeys = new Set<string>()
            for (const at of attempts) {
              if (at.refId && (at.type === 'vocab' || at.type === 'reading')) {
                completedKeys.add(`${at.type}:${at.refId}`)
              }
            }
            return { account, assignments, completedKeys }
          }),
        )
        if (!cancelled) setBundles(bundles)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '불러오기 실패')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const visible = useMemo(() => {
    if (!hideCompleted) return bundles
    return bundles.filter((b) =>
      b.assignments.some((a) => !b.completedKeys.has(`${a.type}:${a.refId}`)),
    )
  }, [bundles, hideCompleted])

  async function copyText(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500)
    } catch {
      window.alert('클립보드 복사에 실패했습니다.')
    }
  }

  function downloadCsv() {
    const rows = [['발송유형', '템플릿코드', '수신번호', '이름', '1', '2']]
    for (const b of visible) {
      rows.push([
        msgType,
        templateCode,
        b.account.phone ?? '',
        b.account.displayName,
        statusValue(b),
        notice,
      ])
    }
    const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const today = new Date()
    const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
    a.href = url
    a.download = `뿌리오_알림톡_과제현황_${stamp}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">알림톡 발송 도우미 (뿌리오)</h1>
        <p className="text-sm text-slate-500 mt-1">
          학생별 과제 현황을 자동으로 채워 뿌리오 알림톡 변수 CSV를 만듭니다. 다운로드 받아
          뿌리오 대량발송에 그대로 업로드하세요.
        </p>
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold text-slate-600 mb-2">
          템플릿 양식 (강조표기형)
        </p>
        <pre className="text-xs leading-relaxed text-slate-800 whitespace-pre-wrap font-sans">
          {TEMPLATE_PREVIEW}
        </pre>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-700">뿌리오 발송 정보</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              발송 유형
            </label>
            <select
              value={msgType}
              onChange={(e) => setMsgType(e.target.value as MsgType)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {MSG_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              알림톡 템플릿 코드
            </label>
            <input
              type="text"
              value={templateCode}
              onChange={(e) => setTemplateCode(e.target.value)}
              placeholder="예: TPL_20260613_001"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
        <p className="text-xs text-slate-500">
          입력 값은 브라우저에 자동 저장됩니다. 강조표기 제목/보조문구는 뿌리오에 등록된
          템플릿에서 처리되므로 따로 입력하지 않습니다.
        </p>
      </div>

      <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            안내사항{' '}
            <span className="font-normal text-slate-500">
              (모든 학생에게 동일하게 들어가는 [*2*] 칸)
            </span>
          </label>
          <textarea
            value={notice}
            onChange={(e) => setNotice(e.target.value)}
            rows={3}
            placeholder="예) 이번 주말까지 미완료 과제 마무리 부탁드립니다."
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideCompleted}
              onChange={(e) => setHideCompleted(e.target.checked)}
              className="accent-brand-600"
            />
            미완료 과제가 있는 학생만 보기
          </label>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={visible.length === 0}
            className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-50"
          >
            CSV 다운로드 ({visible.length}명)
          </button>
        </div>
      </div>

      {loading && <p className="text-slate-500 text-sm">불러오는 중...</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {!loading && visible.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          표시할 학생이 없습니다.
        </div>
      )}

      <ul className="space-y-3">
        {visible.map((b) => {
          const v1 = statusValue(b)
          const totalCnt = b.assignments.length
          const doneCnt = b.assignments.filter((a) =>
            b.completedKeys.has(`${a.type}:${a.refId}`),
          ).length
          return (
            <li
              key={b.account.id}
              className="rounded-lg border border-slate-200 bg-white p-4 space-y-2"
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">
                    {b.account.displayName}
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {b.account.phone || '연락처 없음'}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    과제 {doneCnt} / {totalCnt} 완료
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => copyText(b.account.id, v1)}
                  className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-3 py-1.5 hover:bg-slate-100"
                >
                  {copiedId === b.account.id ? '복사됨!' : '[*1*] 복사'}
                </button>
              </div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                [*1*] 변수 값
              </p>
              <pre className="rounded-md bg-slate-50 border border-slate-200 p-3 text-xs leading-relaxed text-slate-800 whitespace-pre-wrap font-sans">
                {v1}
              </pre>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
