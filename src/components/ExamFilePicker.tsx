import { useRef, useState } from 'react'
import { extractExamText } from '../lib/examText'

/**
 * 시험지 파일(PDF/HWPX) 업로드 → 텍스트 추출 후 onText 콜백.
 * 추출된 텍스트는 AI 등급컷 판단에 사용된다.
 */
export function ExamFilePicker({
  onText,
}: {
  onText: (text: string) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setOk(false)
    setBusy(true)
    try {
      const text = await extractExamText(file)
      setName(file.name)
      onText(text)
      if (text.trim().length < 20) {
        setError('텍스트를 거의 추출하지 못했습니다. 스캔(이미지) PDF면 텍스트 기반 파일로 올려주세요.')
      } else {
        setOk(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '파일 처리 실패')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1">
      <input
        ref={ref}
        type="file"
        accept=".pdf,.hwpx,application/pdf"
        onChange={onChange}
        className="hidden"
      />
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={busy}
          className="rounded-md border border-slate-300 text-slate-700 text-xs font-medium px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy ? '읽는 중…' : '시험지 파일 첨부 (PDF/HWPX)'}
        </button>
        {name && (
          <span className="text-[11px] text-slate-500 truncate max-w-[12rem]">
            {ok ? '✓ ' : ''}
            {name}
          </span>
        )}
      </div>
      <p className="text-[11px] text-slate-400">
        첨부하면 AI가 실제 시험지 난이도를 보고 등급컷을 추정합니다. 없으면 총점 기준 대략 추정.
      </p>
      {error && <p className="text-[11px] text-amber-600">{error}</p>}
    </div>
  )
}
