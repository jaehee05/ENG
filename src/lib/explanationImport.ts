import type { KoreanMock, KoreanMockQuestion } from './types'

/**
 * 원고 형식 .md 를 되읽어 시험지에 채워 넣는다. 내보내기(mockToMarkdown)의 짝.
 *
 * 해설을 앱에서 한 칸씩 치는 것보다 원고로 쓰고 통째로 올리는 편이 빠르다.
 * 형식은 docs/해설-스킬/SKILL.md 의 원고 규격 그대로다 — 내보낸 파일을 고쳐
 * 다시 올리는 왕복이 되어야 하므로, 내보내기가 적는 [연계: …] 줄도 읽는다.
 *
 * 정답과 배점은 **읽기만 하고 고치지 않는다.** 파일과 다르면 경고로만 알린다.
 * 정답을 바꾸면 학생 응시 기록이 전부 재채점되기 때문에, 해설을 올리는 김에
 * 조용히 일어날 일이 아니다.
 */

const CIRCLED = ['①', '②', '③', '④', '⑤']

/** 원문자 → 1~5. 아니면 null. */
function choiceOf(ch: string): number | null {
  const i = CIRCLED.indexOf(ch)
  return i < 0 ? null : i + 1
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * 원고 한 덩어리 → 저장할 HTML.
 *
 * 굵게(**)·기울임(*)만 되살린다. 내보내기가 그 둘만 남기기 때문이고,
 * 그 밖의 글자는 그대로 둔다 — 표·이미지는 원고에서 글자로만 남아 있다.
 */
export function markdownToHtml(md: string): string {
  const lines = md
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return ''
  return lines
    .map((l) => {
      let t = escapeHtml(l)
      t = t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      t = t.replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, '$1<i>$2</i>')
      return `<p>${t}</p>`
    })
    .join('')
}

export interface ParsedQuestion {
  number: number
  /** '정답 해설 : ⑤' 에서 읽은 정답. 못 읽었으면 null. */
  answer: number | null
  /** 유형 라벨 뒤 (3점) 표시. */
  points3: boolean
  linkedSource: string
  /** '*' 총평과 '→' 보충. 출제자의 한마디로 들어간다. */
  note: string
  explanation: string
  /** 선지 번호(문자열) → 오답 해설. */
  choices: Record<string, string>
  /** 원문자 없이 통짜로 적힌 오답 해설 (옛 형식). */
  legacyWrong: string
}

export interface ParsedSection {
  label: string
  questions: ParsedQuestion[]
}

export interface ParsedDoc {
  title: string
  sections: ParsedSection[]
}

/** 지금 읽는 줄이 어느 칸에 쌓이는지. */
type Sink =
  | { kind: 'expl' }
  | { kind: 'note' }
  | { kind: 'legacy' }
  | { kind: 'choice'; n: number }

const RE_SECTION = /^\[([^\]]+)\]$/
const RE_QUESTION = /^(\d{1,2})\.\s*(?:\[[^\]]*\])?\s*(\(3점\))?\s*$/
const RE_LINK = /^\[연계\s*:?\s*(.+)\]$/
const RE_ANSWER = /^정답\s*해설\s*:?\s*(.)\s*(.*)$/
const RE_WRONG_HEAD = /^오답\s*해설\s*$/

/** 원고 .md 를 절·문항으로 쪼갠다. 형식을 벗어난 줄은 앞 칸에 이어 붙인다. */
export function parseExplanationMarkdown(text: string): ParsedDoc {
  const doc: ParsedDoc = { title: '', sections: [] }
  let section: ParsedSection | null = null
  let q: ParsedQuestion | null = null
  /** 지금 글이 쌓이는 칸. */
  let sink: Sink | null = null

  const push = (line: string) => {
    const s = sink
    const target = q
    if (!target || !s) return
    const add = (prev: string) => (prev ? `${prev}\n${line}` : line)
    if (s.kind === 'expl') target.explanation = add(target.explanation)
    else if (s.kind === 'note') target.note = add(target.note)
    else if (s.kind === 'legacy') target.legacyWrong = add(target.legacyWrong)
    else target.choices[String(s.n)] = add(target.choices[String(s.n)] ?? '')
  }

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue

    if (!section && !q && line.startsWith('제목:')) {
      doc.title = line.slice(3).trim()
      continue
    }

    const link = RE_LINK.exec(line)
    if (link && q) {
      q.linkedSource = link[1].trim()
      continue
    }

    const sec = RE_SECTION.exec(line)
    if (sec && !link) {
      section = { label: sec[1].trim(), questions: [] }
      doc.sections.push(section)
      q = null
      sink = null
      continue
    }

    const qm = RE_QUESTION.exec(line)
    if (qm) {
      // 절 표시 없이 시작하는 원고도 받아 준다 — 공통과목으로 본다.
      if (!section) {
        section = { label: '공통과목', questions: [] }
        doc.sections.push(section)
      }
      q = {
        number: Number(qm[1]),
        answer: null,
        points3: !!qm[2],
        linkedSource: '',
        note: '',
        explanation: '',
        choices: {},
        legacyWrong: '',
      }
      section.questions.push(q)
      sink = null
      continue
    }

    if (!q) continue

    if (line.startsWith('*') && !line.startsWith('**')) {
      // 문항 총평. 앱에는 따로 둘 자리가 없어 출제자의 한마디로 합친다.
      sink = { kind: 'note' }
      push(line.replace(/^\*\s*/, ''))
      continue
    }

    const am = RE_ANSWER.exec(line)
    if (am) {
      q.answer = choiceOf(am[1])
      sink = { kind: 'expl' }
      // 원문자를 못 읽었으면 그 글자도 본문이다 — 버리지 않는다.
      const body = q.answer == null ? `${am[1]}${am[2]}` : am[2]
      if (body.trim()) push(body.trim())
      continue
    }

    if (RE_WRONG_HEAD.test(line)) {
      sink = { kind: 'legacy' }
      continue
    }

    const n = choiceOf(line[0])
    if (n != null) {
      sink = { kind: 'choice', n }
      const body = line.slice(1).trim()
      if (body) push(body)
      continue
    }

    if (/^[→⇨➔]/.test(line)) {
      // 정답 해설에 붙는 보충은 한마디로, 선지에 붙는 보충은 그 선지 안에.
      const body = line.replace(/^[→⇨➔]\s*/, '')
      if (sink?.kind === 'choice') push(body)
      else {
        sink = { kind: 'note' }
        push(body)
      }
      continue
    }

    push(line)
  }

  return doc
}

export interface ImportResult {
  questions: KoreanMockQuestion[]
  electives: KoreanMock['electives']
  /** 실제로 채운 문항 수. */
  applied: number
  /** 문항은 찾았지만 사람이 봐야 할 것들. */
  warnings: string[]
}

/** 파싱 결과를 시험지에 얹는다. 파일에 없는 문항은 건드리지 않는다. */
export function applyParsedToMock(mock: KoreanMock, doc: ParsedDoc): ImportResult {
  const warnings: string[] = []
  let applied = 0

  const fill = (q: KoreanMockQuestion, p: ParsedQuestion): KoreanMockQuestion => {
    const next = { ...q }

    if (p.answer != null && p.answer !== q.answer) {
      warnings.push(
        `${q.number}번 정답이 다릅니다 — 파일 ${CIRCLED[p.answer - 1]}, 시험지 ${CIRCLED[q.answer - 1] ?? q.answer}. 정답은 그대로 두었습니다.`,
      )
    }
    const storedPoints = q.points === 3
    if (p.points3 !== storedPoints) {
      warnings.push(
        `${q.number}번 배점이 다릅니다 — 파일 ${p.points3 ? '3점' : '2점'}, 시험지 ${storedPoints ? '3점' : '2점'}. 배점은 그대로 두었습니다.`,
      )
    }

    const expl = markdownToHtml(p.explanation)
    if (expl) next.explanation = expl
    else delete next.explanation

    const note = markdownToHtml(p.note)
    if (note) next.examinerNote = note
    else delete next.examinerNote

    if (p.linkedSource) next.linkedSource = p.linkedSource
    else delete next.linkedSource

    const choices: Record<string, string> = {}
    for (const [k, v] of Object.entries(p.choices)) {
      if (Number(k) === q.answer) continue // 정답 칸에는 오답 해설을 두지 않는다
      const html = markdownToHtml(v)
      if (html) choices[k] = html
    }
    if (Object.keys(choices).length) {
      next.explanationChoices = choices
      delete next.explanationWrong
    } else {
      delete next.explanationChoices
      const legacy = markdownToHtml(p.legacyWrong)
      if (legacy) next.explanationWrong = legacy
      else delete next.explanationWrong
    }

    applied += 1
    return next
  }

  /** 절 하나를 문항 배열에 얹는다. 없는 번호는 경고로 남긴다. */
  const applySection = (
    questions: KoreanMockQuestion[],
    parsed: ParsedQuestion[],
    label: string,
  ): KoreanMockQuestion[] => {
    const byNumber = new Map(parsed.map((p) => [p.number, p]))
    const out = questions.map((q) => {
      const p = byNumber.get(q.number)
      return p ? fill(q, p) : q
    })
    const have = new Set(questions.map((q) => q.number))
    for (const p of parsed) {
      if (!have.has(p.number)) warnings.push(`[${label}] ${p.number}번은 시험지에 없습니다.`)
    }
    return out
  }

  /** '공통과목'·'공통' 은 공통 문항으로 본다. 나머지는 선택과목 이름으로 찾는다. */
  const isCommon = (label: string) => /^공통/.test(label)

  let questions = mock.questions ?? []
  const electives = mock.electives ? mock.electives.map((el) => ({ ...el })) : undefined

  for (const sec of doc.sections) {
    if (sec.questions.length === 0) continue
    if (isCommon(sec.label)) {
      questions = applySection(questions, sec.questions, sec.label)
      continue
    }
    const el = electives?.find((e) => e.name === sec.label)
    if (!el) {
      warnings.push(`[${sec.label}] 은 이 시험지에 없는 선택과목입니다. 건너뛰었습니다.`)
      continue
    }
    el.questions = applySection(el.questions ?? [], sec.questions, sec.label)
  }

  return { questions, electives, applied, warnings }
}
