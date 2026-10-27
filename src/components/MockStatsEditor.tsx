import { useState } from 'react'
import { estimateMockStats } from '../lib/api'
import { updateKoreanMock } from '../lib/firestore'
import { COMMON_KEY, parseRatesText, ratesToText } from '../lib/mockStats'
import type { KoreanMock, MockGradeCut, MockTeamStats } from '../lib/types'
import { ExamFilePicker } from './ExamFilePicker'
import { Button, confirm } from './ui'

const GRADES = [1, 2, 3, 4, 5, 6, 7, 8]

export type StatsTarget = 'national' | 'team'

const TAB: Record<StatsTarget, string> = { national: '전국단위', team: 'OUR-TEAM' }

/** OUR-TEAM 표본 수 — '대충 100명'. 시험마다 조금씩 달라야 지어낸 티가 덜 난다. */
function roughSampleSize(): number {
  return 92 + Math.floor(Math.random() * 25)
}

/**
 * 관리자: 결과 화면 통계 입력 — 전국단위(mock.national) 또는 OUR-TEAM(mock.team).
 * 사설 모의고사는 공개 통계가 없고 우리 학생 표본은 작아서, 보통은 'AI로 채우기'로
 * 문제지·해설을 보고 어림한 값을 넣는다. 전국단위는 잘하는 집단, OUR-TEAM 은 약 100명에
 * 전국단위보다 등급컷이 낮은 집단으로 잡는다(운영자 결정). 학생 화면에는 AI 추정이라고
 * 따로 적지 않는다. 비운 칸은 화면에도 비어 나온다.
 */
export function MockStatsEditor({
  mock,
  target,
  onSaved,
}: {
  mock: KoreanMock
  target: StatsTarget
  onSaved: (stats: MockTeamStats | undefined) => void
}) {
  const saved: MockTeamStats | undefined = target === 'national' ? mock.national : mock.team
  const keys = mock.electives?.length ? mock.electives.map((e) => e.name) : [COMMON_KEY]
  const groups = mock.electives?.length
    ? [{ key: COMMON_KEY, label: '공통과목' }, ...mock.electives.map((e) => ({ key: e.name, label: e.name }))]
    : [{ key: COMMON_KEY, label: '전체 문항' }]

  const [cuts, setCuts] = useState<Record<string, Record<number, string>>>(() => {
    const out: Record<string, Record<number, string>> = {}
    for (const k of [...keys, '__std']) {
      const src = k === '__std' ? saved?.stdCutoffs : saved?.cutoffs?.[k]
      out[k] = Object.fromEntries((src ?? []).map((c) => [c.grade, String(c.minScore)]))
    }
    return out
  })
  const [ratesText, setRatesText] = useState<Record<string, string>>(() =>
    Object.fromEntries(groups.map((g) => [g.key, ratesToText(saved?.rates?.[g.key])])),
  )
  const [sampleSize, setSampleSize] = useState(saved?.sampleSize ? String(saved.sampleSize) : '')
  const [busy, setBusy] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [examText, setExamText] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  function setCut(key: string, grade: number, v: string) {
    setCuts((prev) => ({ ...prev, [key]: { ...prev[key], [grade]: v } }))
    setMsg(null)
  }

  function toCutList(m: Record<number, string> | undefined): MockGradeCut[] {
    return GRADES.flatMap((g) => {
      const n = Number.parseInt(m?.[g] ?? '', 10)
      return Number.isFinite(n) ? [{ grade: g, minScore: n }] : []
    })
  }

  function build(): MockTeamStats | undefined {
    const cutoffs: Record<string, MockGradeCut[]> = {}
    for (const k of keys) {
      const list = toCutList(cuts[k])
      if (list.length) cutoffs[k] = list
    }
    const rates: Record<string, Record<string, number[]>> = {}
    for (const g of groups) {
      const parsed = parseRatesText(ratesText[g.key] ?? '')
      if (Object.keys(parsed).length) rates[g.key] = parsed
    }
    const stdCutoffs = toCutList(cuts.__std)
    const out: MockTeamStats = {}
    if (Object.keys(cutoffs).length) out.cutoffs = cutoffs
    if (stdCutoffs.length) out.stdCutoffs = stdCutoffs
    if (Object.keys(rates).length) out.rates = rates
    if (!Object.keys(out).length) return undefined
    const n = Number.parseInt(sampleSize, 10)
    if (target === 'team' && n > 0) out.sampleSize = n
    return out
  }

  async function save() {
    setBusy(true)
    setMsg(null)
    try {
      const stats = build()
      await updateKoreanMock(mock.id, { [target]: stats ?? null })
      onSaved(stats)
      setMsg(
        target === 'national'
          ? stats
            ? '저장했어요. 학생 결과 화면에 전국단위 탭이 생겨요.'
            : '비워서 저장했어요. 전국단위 탭이 사라져요.'
          : stats
            ? '저장했어요. OUR-TEAM 탭이 이 값으로 보여요.'
            : '비워서 저장했어요. OUR-TEAM 탭은 실제 응시 기록으로 돌아가요.',
      )
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setBusy(false)
    }
  }

  /** AI 추정값으로 칸을 채운다. 저장은 따로 — 보고 고친 뒤 저장. */
  async function fillWithAi() {
    setAiBusy(true)
    setMsg(null)
    try {
      // OUR-TEAM 은 전국단위보다 낮게 — 전국단위가 저장돼 있으면 그걸 견주게 넘긴다.
      const est = await estimateMockStats(mock, target, examText, target === 'team' ? mock.national : undefined)
      const toMap = (list: MockGradeCut[] | undefined) =>
        Object.fromEntries((list ?? []).map((c) => [c.grade, String(c.minScore)]))
      setCuts(Object.fromEntries([...keys.map((k) => [k, toMap(est.cutoffs?.[k])]), ['__std', toMap(est.stdCutoffs)]]))
      setRatesText(Object.fromEntries(groups.map((g) => [g.key, ratesToText(est.rates?.[g.key])])))
      if (target === 'team' && !sampleSize) setSampleSize(String(roughSampleSize()))
      setMsg('AI 추정값을 채웠어요. 확인하고 저장하세요.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'AI 추정 실패')
    } finally {
      setAiBusy(false)
    }
  }

  async function clearAll() {
    if (!(await confirm(`${TAB[target]} 통계를 모두 지울까요?`, { danger: true, confirmText: '지우기' }))) return
    setSampleSize('')
    setCuts(Object.fromEntries([...keys, '__std'].map((k) => [k, {}])))
    setRatesText(Object.fromEntries(groups.map((g) => [g.key, ''])))
    setMsg('지운 내용은 저장해야 반영돼요.')
  }

  const cutCols = [
    ...keys.map((k) => ({ key: k, label: k === COMMON_KEY ? '원점수' : k })),
    { key: '__std', label: '표준점수' },
  ]

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
      <p className="text-xs text-slate-500">
        {target === 'national'
          ? '넣으면 학생 결과 화면에 ‘전국단위’ 탭이 생깁니다. AI는 실력 좋은 전국 응시자 집단으로 어림해요.'
          : '넣으면 ‘OUR-TEAM’ 탭이 실제 응시 기록 대신 이 값을 보여 줍니다. AI는 약 100명, 전국단위보다 등급컷이 낮은 집단으로 어림해요 — 전국단위를 먼저 저장해 두면 그보다 낮게 맞춥니다.'}{' '}
        학생 화면엔 AI 추정이라고 표시하지 않아요. 학생의 표준점수는 등급컷의 원점수·표준점수
        사이를 이어서 추정하고, 백분위는 표준점수로 추정합니다.
      </p>

      <div className="rounded-md bg-slate-50 p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="secondary" onClick={fillWithAi} loading={aiBusy} disabled={busy}>
            AI로 채우기
          </Button>
          <span className="text-[11px] text-slate-500">
            등급컷·표준점수·선지별 선택률을 AI가 어림해 채웁니다. 1분쯤 걸려요.
          </span>
        </div>
        <ExamFilePicker onText={setExamText} />
      </div>

      {target === 'team' && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          표본 수
          <input
            type="number"
            inputMode="numeric"
            value={sampleSize}
            onChange={(e) => {
              setSampleSize(e.target.value)
              setMsg(null)
            }}
            placeholder="100"
            className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <span className="text-[11px] text-slate-500">명 — ‘OUR-TEAM N명 기준’으로 나와요</span>
        </label>
      )}

      <div>
        <p className="text-sm font-medium text-slate-700 mb-1.5">등급컷</p>
        <div className="overflow-x-auto">
          <table className="text-sm border-collapse">
            <thead>
              <tr>
                <th className="px-2 py-1 text-[11px] font-medium text-slate-500 text-left">등급</th>
                {cutCols.map((c) => (
                  <th key={c.key} className="px-1 py-1 text-[11px] font-medium text-slate-500">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GRADES.map((g) => (
                <tr key={g}>
                  <td className="px-2 py-0.5 text-xs font-semibold text-slate-500">{g}</td>
                  {cutCols.map((c) => (
                    <td key={c.key} className="px-1 py-0.5">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={cuts[c.key]?.[g] ?? ''}
                        onChange={(e) => setCut(c.key, g, e.target.value)}
                        className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-slate-700">선지별 선택률(%)</p>
          <p className="text-[11px] text-slate-500">
            한 줄에 ‘문번 ①률 ②률 ③률 ④률 ⑤률’. 표에서 긁어 붙여도 됩니다 — 탭·쉼표·%는 무시해요.
          </p>
        </div>
        {groups.map((g) => {
          const count = Object.keys(parseRatesText(ratesText[g.key] ?? '')).length
          return (
            <div key={g.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-slate-600">{g.label}</span>
                <span className="text-[11px] text-slate-400 tabular-nums">{count}문항 읽음</span>
              </div>
              <textarea
                value={ratesText[g.key] ?? ''}
                onChange={(e) => {
                  setRatesText((prev) => ({ ...prev, [g.key]: e.target.value }))
                  setMsg(null)
                }}
                rows={4}
                placeholder={'1 1.6 1.1 1.4 92.8 3.1\n2 84.2 3.6 2.4 5.2 4.5'}
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" onClick={save} loading={busy} disabled={aiBusy}>
          저장
        </Button>
        <Button size="sm" variant="text" onClick={clearAll} disabled={busy}>
          모두 지우기
        </Button>
        {msg && <span className="text-xs text-slate-500">{msg}</span>}
      </div>
    </div>
  )
}
