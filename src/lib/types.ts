import type { Timestamp } from 'firebase/firestore'

export type UserRole = 'admin' | 'student'
export type UserStatus = 'pending' | 'active' | 'rejected'

export interface UserAccount {
  id: string
  email: string
  password?: string
  displayName: string
  role: UserRole
  status: UserStatus
  school?: string
  phone?: string
  parentPhone?: string
  /** 학생 수강 과목. 없거나 빈 배열이면 둘 다(호환). */
  subjects?: MockSubject[]
  /** true 인 학생에게만 지문 문제풀이 노출. 관리자가 지정. 미설정=미노출. */
  readingAccess?: boolean
  /** 관리자가 지정한 캘린더 색상 키 (sky/emerald/amber/violet/rose/teal/indigo/orange). 없으면 uid 해시. */
  colorKey?: string
  /** true 면 관리자가 미리 등록한 placeholder. 학생이 회원가입하면 자동으로 활성화되고 이 플래그가 해제됨. */
  preregistered?: boolean
  /** iOS Capacitor 앱에서 받은 FCM 디바이스 토큰들 (다중 기기 지원). */
  fcmTokens?: string[]
  createdAt: Timestamp | null
}

/** 계정에서 유효 과목 집합을 뽑는다. 미설정/빈 값은 둘 다로 간주. */
/** 지문 문제풀이 접근 가능 여부. 관리자는 항상, 학생은 지정된 경우만. */
export function canAccessReading(
  a: Pick<UserAccount, 'role' | 'readingAccess'>,
): boolean {
  return a.role === 'admin' || a.readingAccess === true
}

export function accountSubjects(a: Pick<UserAccount, 'subjects'>): {
  korean: boolean
  english: boolean
} {
  const s = a.subjects
  if (!s || s.length === 0) return { korean: true, english: true }
  return {
    korean: s.includes('korean'),
    english: s.includes('english'),
  }
}

export interface VocabExample {
  en: string
  ko?: string
}

export interface VocabSense {
  pos?: string
  ko: string
  definitionEn?: string
  synonyms?: string[]
  examples?: VocabExample[]
}

export interface WordEntry {
  en: string
  ko: string
  /** Phonetic transcription, e.g. "ǽdvent". No surrounding brackets. */
  ipa?: string
  /** Part of speech token: n., v., adj., adv., prep., conj., int. */
  pos?: string
  /** English synonyms list. */
  synonyms?: string[]
  example?: string
  exampleKo?: string
  definitionEn?: string
  /** Multi-sense detail; if present, used for display instead of flat fields. */
  senses?: VocabSense[]
}

/** 단어 시험 형식. 미설정=written(주관식) — 기존 시험지 호환. */
export type VocabFormat = 'written' | 'choice'

/**
 * 5지선다 문항 하나.
 * 선지는 만들 때 한 번 섞어서 저장하고 answer 로 정답 위치를 기록한다.
 * 응시할 때마다 섞으면 같은 시험지를 다시 풀 때 위치가 달라져 오답 복습이 어긋난다.
 */
export interface VocabChoice {
  /** 대상 단어. VocabSet.words 의 en 과 매칭한다. */
  en: string
  /** 선지 5개 (정답 포함, 이미 섞인 상태). */
  choices: string[]
  /** choices 안에서의 정답 인덱스 (0-base). */
  answer: number
}

export interface VocabSet {
  id: string
  title: string
  words: WordEntry[]
  /** 'written'(주관식) | 'choice'(5지선다). 미설정이면 'written'. */
  format?: VocabFormat
  /** format==='choice' 일 때만. 단어별 선지 — en 으로 words 와 맞춘다. */
  choiceSets?: VocabChoice[]
  /** 소유 학생 UID. 없으면 legacy(공용) 시험지 — 학생 뷰 미노출, 관리자만 표시. */
  studentUid?: string
  studentName?: string
  /** Per-student attempt cap. Undefined = unlimited. */
  maxAttempts?: number
  createdBy: string
  createdByName: string
  createdAt: Timestamp | null
}

export interface VocabSeries {
  id: string
  title: string
  lastDayNumber: number
  maxAttempts?: number
  /**
   * 마스터 단어 목록. 저장은 하위 컬렉션 wordChunks 에 나눠서 한다
   * (Firestore 문서 1개 상한 1 MiB — 1600개 근처에서 막힌다).
   * getVocabSeries 는 청크를 합쳐 채워 주고, listVocabSeries 는 비워 둔다.
   */
  words?: WordEntry[]
  /** 단어 개수. 목록에서 청크를 읽지 않고 개수만 보여주기 위한 비정규화 값. */
  wordCount?: number
  /** Default words per DAY when generating next test. */
  perDay?: number
  /** How many words have already been used in DAY tests (cursor). 레거시 공용 커서. */
  usedCount?: number
  /**
   * 학생별 DAY 진행도. 같은 교재(공용 단어은행)로 학생마다 독립적으로
   * DAY 시험지를 생성한다. 키 = studentUid.
   */
  studentProgress?: Record<
    string,
    { usedCount: number; lastDayNumber: number }
  >
  createdBy: string
  createdByName: string
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
}

export type ReadingQuestionType =
  | 'standard'
  | 'cloze'
  | 'order'
  | 'insert'
  | 'summary'
  | 'irrelevant'
  | 'underline-grammar'
  | 'underline-vocab'

export interface ReadingQuestion {
  type?: ReadingQuestionType
  q: string
  /** Original question number in the source exam (e.g., 41, 42). Falls back to position+1 if missing. */
  number?: number
  /** 문항별 해설/풀이 (한국어). 학생이 틀린 문제에서 표시. */
  explanation?: string
  /** Question-specific body text. Falls back to reading.passage if omitted. */
  body?: string
  /** Boxed "given" content shown above the body (order/insert types). */
  intro?: string
  /** Summary panel shown below the body (summary type, with (A)/(B) blanks). */
  summaryBox?: string
  choices: string[]
  answer: number
  /** Configuration score: 3 for 3점 문항. Absent/2 = default. */
  points?: number
  /** Inline image/chart (full data URL, e.g. "data:image/jpeg;base64,..."). */
  image?: string
  /** Inline image를 HTML 문서로 재현한 버전 (있으면 image 대신 이걸로 표시). */
  imageHtml?: string
  /** For 'order' type: paragraphs labelled (A), (B), (C), optionally (D). */
  partA?: string
  partB?: string
  partC?: string
  partD?: string
  /** 단락별 한글 해석 (order 첫 문항의 partA~D 각각 대응). */
  partAKo?: string
  partBKo?: string
  partCKo?: string
  partDKo?: string
}

export const READING_TYPE_LABEL: Record<ReadingQuestionType, string> = {
  standard: '일반 (제목·주제·주장 등)',
  cloze: '빈칸 추론',
  order: '글의 순서',
  insert: '문장 위치',
  summary: '요약문 빈칸',
  irrelevant: '흐름 무관 문장',
  'underline-grammar': '어법상 틀린 것',
  'underline-vocab': '문맥상 낱말 쓰임',
}

export const READING_TYPE_PROMPT: Record<ReadingQuestionType, string> = {
  standard: '윗글의 주제로 가장 적절한 것은?',
  cloze: '다음 빈칸에 들어갈 말로 가장 적절한 것은?',
  order: '주어진 글 다음에 이어질 글의 순서로 가장 적절한 것은?',
  insert: '글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳은?',
  summary: '다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?',
  irrelevant: '다음 글에서 전체 흐름과 관계 없는 문장은?',
  'underline-grammar': '다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?',
  'underline-vocab': '다음 글의 밑줄 친 부분 중, 문맥상 낱말의 쓰임이 적절하지 않은 것은?',
}

export interface Reading {
  id: string
  title: string
  passage: string
  /** 지문 전체에 대한 한국어 해석. 학생이 문제를 틀리면 표시. */
  passageKo?: string
  glossary: WordEntry[]
  choicesGlossary: WordEntry[]
  questions: ReadingQuestion[]
  createdBy: string
  createdByName: string
  createdAt: Timestamp | null
}

/**
 * reading 제목에서 시작 번호를 추출해, number가 비어 있는 문항에 자동 부여.
 * 예: "2027학년도 6월 모의평가 18번" → 1문항이면 18, 2문항이면 18,19
 *     "2027학년도 6월 모의평가 43-45번" → 1번째=43, 2번째=44, 3번째=45
 */
const TITLE_NUM_RE = /^(.+?)\s+(\d+)(?:-(\d+))?\s*(?:번|문제)?\s*$/
export function inferQuestionNumbers(
  title: string,
  questions: ReadingQuestion[],
): ReadingQuestion[] {
  const m = TITLE_NUM_RE.exec(title.trim())
  if (!m) return questions
  const start = Number.parseInt(m[2], 10)
  if (!Number.isFinite(start)) return questions
  return questions.map((q, i) => {
    if (q.number && q.number > 0) return q
    return { ...q, number: start + i }
  })
}

/** 문항이 자체 본문(body/image/imageHtml/order parts)을 갖고 있는지 — 공용 지문이 필요 없음을 의미. */
export function questionHasOwnBody(q: ReadingQuestion): boolean {
  if (q.body && q.body.trim()) return true
  if (q.image) return true
  if (q.imageHtml && q.imageHtml.trim()) return true
  if (
    q.type === 'order' &&
    (q.partA?.trim() ||
      q.partB?.trim() ||
      q.partC?.trim() ||
      q.partD?.trim())
  ) {
    return true
  }
  return false
}

/** 한 reading에서 공용 지문(passage)을 어느 문항 위에 표시할지 인덱스 배열을 만든다.
 *  세트(41~42) 같이 모든 문항이 공용 지문을 쓰는 경우 첫 문항에만 표시되도록.
 *  각 인덱스에 대해 fallback 문자열을 반환(없으면 undefined). */
export function passageFallbackPerQuestion(
  passage: string,
  questions: ReadingQuestion[],
): (string | undefined)[] {
  let used = false
  return questions.map((q) => {
    if (questionHasOwnBody(q)) return undefined
    if (used) return undefined
    if (!passage || !passage.trim()) return undefined
    used = true
    return passage
  })
}

/** 다중 문항 세트에서 위에 한 번만 표시할 공유 지문 블록. */
export type SharedPassageBlock =
  | { kind: 'passage'; text: string }
  | { kind: 'order'; parts: { tag: string; text: string }[] }
  | null

/**
 * 다중 문항 reading에서 공유 지문을 결정.
 * - 첫 문항이 order이고 partA/B/C/D 중 하나라도 채워져 있으면 그 단락 블록 (43~45 형식)
 * - reading.passage가 있으면 그것을 공유 지문으로 (41~42 형식)
 * - 그 외 passage 비고 첫 문항 body에만 본문이 있고 나머지 문항 body가 비면
 *   첫 문항 body를 공유 지문으로 끌어올림 (자동 분류 오인 보정)
 * - 단일 문항이면 분리 안 함 (null)
 */
export function getSharedPassageBlock(reading: {
  passage: string
  questions: ReadingQuestion[]
}): SharedPassageBlock {
  if (reading.questions.length < 2) return null
  const first = reading.questions[0]
  if (first && first.type === 'order') {
    const parts = (['A', 'B', 'C', 'D'] as const)
      .map((tag) => ({
        tag,
        text:
          tag === 'A'
            ? first.partA?.trim() ?? ''
            : tag === 'B'
              ? first.partB?.trim() ?? ''
              : tag === 'C'
                ? first.partC?.trim() ?? ''
                : first.partD?.trim() ?? '',
      }))
      .filter((p) => p.text)
    if (parts.length > 0) return { kind: 'order', parts }
  }
  if (reading.passage && reading.passage.trim()) {
    return { kind: 'passage', text: reading.passage }
  }
  if (
    first &&
    first.body &&
    first.body.trim() &&
    reading.questions.slice(1).every((q) => !q.body || !q.body.trim())
  ) {
    return { kind: 'passage', text: first.body }
  }
  return null
}

/** SharedPassageBlock을 분리해 표시할 때, 각 문항에서 그 본문을 비워야 한다.
 *  - kind=order: 첫 문항의 partA/B/C/D 제거
 *  - kind=passage: 첫 문항 body가 공유 지문 텍스트와 같으면 그 body도 제거
 *    (reading.passage 케이스는 이미 body를 안 쓰므로 영향 없음)
 */
export function questionsWithoutShared(
  questions: ReadingQuestion[],
  block: SharedPassageBlock,
): ReadingQuestion[] {
  if (!block) return questions
  if (block.kind === 'order') {
    return questions.map((q, i) =>
      i === 0
        ? { ...q, partA: '', partB: '', partC: '', partD: '' }
        : q,
    )
  }
  if (block.kind === 'passage') {
    return questions.map((q, i) => {
      if (i !== 0) return q
      if (q.body && q.body.trim() === block.text.trim()) {
        return { ...q, body: '' }
      }
      return q
    })
  }
  return questions
}

export interface VocabResult {
  en: string
  ko: string
  /** 주관식은 학생이 쓴 문장, 5지선다는 고른 선지 텍스트(미선택이면 빈 문자열). */
  userAnswer: string
  correct: boolean
  /** 5지선다 응시 기록. 결과 화면에서 응시 당시 선지를 그대로 보여주기 위해 남긴다. */
  choices?: string[]
  /** choices 안에서의 정답 인덱스. */
  answerIndex?: number
  /** 학생이 고른 인덱스. 미선택이면 -1. */
  userIndex?: number
}

export interface ReadingResult {
  q: string
  choices: string[]
  userAnswer: number
  correctAnswer: number
  correct: boolean
  /** Original exam question number (e.g., 41). Falls back to position+1 if missing. */
  number?: number
}

export interface KoreanMockQuestion {
  /** 문항 번호 (1-base). */
  number: number
  /** 정답 (1-5). */
  answer: number
  /** 배점 (기본 2). */
  points?: number
  /**
   * 정답 해설 (HTML, 관리자 입력). 정오표에서 문항 탭 시 표시.
   * 정답/오답 해설을 나누기 전에 입력된 기존 해설도 이 필드에 그대로 남아 있다.
   */
  explanation?: string
  /**
   * 선지별 오답 해설. 키는 선택지 번호('1'~'5'), 값은 해설 HTML.
   * 정답 번호 키는 쓰지 않는다. 표시할 때 앞에 원문자(①~⑤)가 자동으로 붙으므로
   * 값에는 번호를 넣지 않는다.
   * (Firestore 맵이라 키가 문자열이다)
   */
  explanationChoices?: Record<string, string>
  /**
   * @deprecated 선지별로 나누기 전의 통짜 오답 해설.
   * 기존 입력분을 잃지 않도록 남겨두고, 있으면 그대로 보여준다.
   */
  explanationWrong?: string
  /**
   * 오답 리뷰용 지문 원문. 모의고사는 종이 시험지로 풀기 때문에 응시 중에는
   * 쓰이지 않고, 채점 후 학생이 "틀린" 문항을 열었을 때만 펼쳐 보여준다.
   */
  passage?: string
  /** 지문 한국어 해석 (영어 지문에서만 의미 있음). */
  passageKo?: string
  /** 지문 어휘. 탭하면 뜻이 뜨는 단어들 (영어 지문에서만 의미 있음). */
  glossary?: WordEntry[]
}

/** 오답 리뷰로 보여줄 지문이 붙어 있는 문항인지. */
export function hasMockPassage(q: KoreanMockQuestion): boolean {
  return typeof q.passage === 'string' && q.passage.trim().length > 0
}

/** 시험지 형식. 레거시(미설정)는 주관식. */
export function getVocabFormat(v: Pick<VocabSet, 'format'>): VocabFormat {
  return v.format === 'choice' ? 'choice' : 'written'
}

/** 단어(en) → 선지 로 바로 꺼내 쓰기 위한 맵. */
export function choiceSetMap(v: VocabSet): Map<string, VocabChoice> {
  const m = new Map<string, VocabChoice>()
  for (const c of v.choiceSets ?? []) {
    if (c && typeof c.en === 'string' && Array.isArray(c.choices)) m.set(c.en, c)
  }
  return m
}

/** 정답/오답 어느 쪽이든 해설이 있는지. */
export function hasMockExplanation(q: KoreanMockQuestion): boolean {
  return Boolean(
    q.explanation?.trim() ||
      q.explanationWrong?.trim() ||
      mockWrongChoiceEntries(q).length > 0,
  )
}

/**
 * 선지별 오답 해설을 표시 순서(선지 번호 오름차순)로 뽑는다.
 * 정답 번호와 빈 값은 제외한다.
 */
export function mockWrongChoiceEntries(
  q: KoreanMockQuestion,
): { choice: number; mark: string; html: string }[] {
  const src = q.explanationChoices
  if (!src) return []
  return Object.entries(src)
    .map(([k, html]) => ({ choice: Number(k), html }))
    .filter(
      (e) =>
        Number.isFinite(e.choice) &&
        e.choice !== q.answer &&
        typeof e.html === 'string' &&
        e.html.trim().length > 0,
    )
    .sort((a, b) => a.choice - b.choice)
    .map((e) => ({ choice: e.choice, mark: choiceMark(e.choice), html: e.html }))
}

/** 선택지 원문자. answer(1~5)를 ①~⑤ 로 옮길 때 쓴다. */
export const CHOICE_MARKS = ['①', '②', '③', '④', '⑤'] as const

/** 정답 번호(1~5)를 원문자로. 범위를 벗어나면 숫자 그대로. */
export function choiceMark(n: number): string {
  return CHOICE_MARKS[n - 1] ?? String(n)
}

/** 정답을 뺀 나머지 선택지 원문자들 (오답 해설 작성 힌트용). */
export function wrongChoiceMarks(answer: number): string[] {
  return CHOICE_MARKS.filter((_, i) => i + 1 !== answer)
}

/** 정답을 뺀 나머지 선택지 번호들 (선지별 오답 해설 입력칸 생성용). */
export function wrongChoiceNumbers(answer: number): number[] {
  return CHOICE_MARKS.map((_, i) => i + 1).filter((n) => n !== answer)
}

/** 선택과목 옵션 (수능형: 공통 + 택1). */
export interface KoreanMockElective {
  /** 옵션 이름 (예: 화법과 작문, 언어와 매체). */
  name: string
  /** 이 선택과목 첫 문항 번호 (보통 공통 다음, 예: 35). */
  startNumber: number
  questions: KoreanMockQuestion[]
  /** 이 선택과목(공통+선택 총점 기준) 등급컷. 선택과목마다 다르다. */
  gradeCutoffs?: MockGradeCut[]
}

/** 등급컷 한 줄 (원점수 기준). */
export interface MockGradeCut {
  /** 1~9 등급. */
  grade: number
  /** 이 원점수 이상이면 해당 등급. */
  minScore: number
}

/** 모의고사 과목. 기존 레코드는 'korean'으로 간주. */
export type MockSubject = 'korean' | 'english'

export interface KoreanMock {
  id: string
  title: string
  /** 'korean' | 'english'. 미설정이면 'korean'으로 간주 (레거시 호환). */
  subject?: MockSubject
  /** 답안 일괄 입력 시 첫 문항 번호. 영어는 보통 18. 미설정이면 1. */
  startNumber?: number
  /** 공통 과목 문항 (선택과목 없으면 전체 문항). */
  questions: KoreanMockQuestion[]
  /** 선택과목 옵션들. 있으면 학생이 하나 선택해 응시. 없으면 공통만. */
  electives?: KoreanMockElective[]
  /** 출제자 한마디 (결과 화면 표시). */
  examinerComment?: string
  /** AI 산출 등급컷 (원점수 기준). */
  gradeCutoffs?: MockGradeCut[]
  /** 해설 PDF 다운로드 URL(Storage). 설정 시 채점 후 학생에게 제공, 없으면 생략. */
  explanationPdfUrl?: string
  /** 해설 PDF 원본 파일명(표시용). */
  explanationPdfName?: string
  /** 해설 PDF Storage 경로(교체·삭제용). */
  explanationPdfPath?: string
  createdAt: Timestamp | null
  createdBy: string
  createdByName: string
}

export function getMockSubject(m: KoreanMock): MockSubject {
  return m.subject ?? 'korean'
}

/** 문항 배점 (미설정=2). */
export function questionPoints(q: KoreanMockQuestion): number {
  return q.points && q.points > 0 ? q.points : 2
}

/**
 * 등급컷 + 원점수로 등급 산출 (없으면 null). minScore 이상이면 그 등급.
 * 입력 순서/단조성과 무관하게, 점수가 만족하는 등급컷 중 가장 좋은(번호가 작은) 등급을 반환.
 */
export function gradeFromScore(
  score: number,
  cuts?: MockGradeCut[],
): number | null {
  const valid = (cuts ?? []).filter((c) => Number.isFinite(c.minScore))
  if (valid.length === 0) return null
  const satisfied = valid.filter((c) => score >= c.minScore)
  if (satisfied.length > 0) return Math.min(...satisfied.map((c) => c.grade))
  // 어떤 등급컷도 못 넘으면 가장 낮은 등급의 다음 등급(최대 9).
  return Math.min(9, Math.max(...valid.map((c) => c.grade)) + 1)
}

export function getMockStartNumber(m: KoreanMock): number {
  return m.startNumber && m.startNumber > 0 ? m.startNumber : 1
}

export const MOCK_SUBJECT_LABEL: Record<MockSubject, string> = {
  korean: '국어',
  english: '영어',
}

export interface KoreanMockResult {
  number: number
  /** 학생이 고른 답 (0 = 미응답, 1-5). */
  userAnswer: number
  correctAnswer: number
  correct: boolean
}

export interface Attempt {
  id: string
  studentUid: string
  studentName: string
  type: 'vocab' | 'reading' | 'wordbook' | 'korean_mock'
  refId: string
  refTitle: string
  total: number
  correct: number
  /** True when this attempt is a 연습(practice) run — excluded from maxAttempts limit. */
  practice?: boolean
  vocabResults?: VocabResult[]
  readingResults?: ReadingResult[]
  koreanMockResults?: KoreanMockResult[]
  /** 'korean_mock' type 한정: 국어/영어 모의고사 과목. 없으면 'korean'으로 간주(레거시). */
  mockSubject?: MockSubject
  /** 'korean_mock' 한정: 학생이 응시한 선택과목 이름(있을 때). 등급컷 판정에 사용. */
  mockElectiveName?: string
  /** reading 한정: 오답 검토(재시도 1회) 완료 시각. */
  wrongReviewedAt?: Timestamp | null
  /** reading 한정: 오답 문항별 재시도에서 고른 선지 인덱스. 키는 문항 인덱스 문자열. */
  retryAnswers?: Record<string, number>
  createdAt: Timestamp | null
}

/** reading attempt가 완료(만점이거나 오답 검토 완료)인지 판정. */
export function isReadingAttemptComplete(a: Attempt): boolean {
  const total = a.total || 0
  const correct = a.correct || 0
  if (total > 0 && correct === total) return true
  return !!a.wrongReviewedAt
}

/**
 * 과제 진행 상태:
 * - none: 시도 기록 없음
 * - wrong_pending: (reading) 시도했지만 오답 검토 안 함
 * - pending: (vocab) 시도했지만 minCorrect 미달
 * - done: 완료 (manualDone 포함)
 */
export type AssignmentStatus = 'none' | 'wrong_pending' | 'pending' | 'done'

export interface AssignmentStatusView {
  status: AssignmentStatus
  label: string
  tone: 'slate' | 'amber' | 'red' | 'brand'
}

export function getAssignmentStatusView(
  asn: Assignment,
  atts: Attempt[],
): AssignmentStatusView {
  const override = assignmentManualOverride(asn)
  if (override === 'done') {
    return { status: 'done', label: '완료', tone: 'brand' }
  }
  if (override === 'undone') {
    return { status: 'none', label: '미완료(수동)', tone: 'slate' }
  }
  const matched = atts.filter(
    (a) => a.type === asn.type && a.refId === asn.refId && !a.practice,
  )
  if (matched.length === 0) {
    return { status: 'none', label: '미시작', tone: 'slate' }
  }
  if (asn.type === 'reading') {
    const anyComplete = matched.some((a) => isReadingAttemptComplete(a))
    if (anyComplete) return { status: 'done', label: '완료', tone: 'brand' }
    return {
      status: 'wrong_pending',
      label: '오답 검토 미완료',
      tone: 'amber',
    }
  }
  if (asn.type === 'vocab') {
    if (asn.minCorrect && asn.minCorrect > 0) {
      const passed = matched.some((a) => (a.correct ?? 0) >= (asn.minCorrect ?? 0))
      if (passed) return { status: 'done', label: '완료', tone: 'brand' }
      return {
        status: 'pending',
        label: `기준 미달 (${asn.minCorrect}↑ 필요)`,
        tone: 'amber',
      }
    }
    return { status: 'done', label: '완료', tone: 'brand' }
  }
  if (asn.type === 'korean_mock') {
    return { status: 'done', label: '완료', tone: 'brand' }
  }
  return { status: 'none', label: '미시작', tone: 'slate' }
}

export interface DDayView {
  /** 음수면 마감 지남, 0이면 오늘, 양수면 남은 일수. dueAt이 없으면 null. */
  days: number | null
  label: string
  /** 'overdue' | 'today' | 'soon' (≤3일) | 'normal' | 'none'. */
  tone: 'overdue' | 'today' | 'soon' | 'normal' | 'none'
}

export function getDDay(
  dueAt: Timestamp | null | undefined,
  now: Date = new Date(),
): DDayView {
  if (!dueAt) return { days: null, label: '마감 없음', tone: 'none' }
  const due = dueAt.toDate()
  // 날짜 단위 비교: 자정 기준.
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffMs = dueDay.getTime() - today.getTime()
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (days < 0) return { days, label: `D+${-days} (지남)`, tone: 'overdue' }
  if (days === 0) return { days, label: '오늘 마감', tone: 'today' }
  if (days <= 3) return { days, label: `D-${days}`, tone: 'soon' }
  return { days, label: `D-${days}`, tone: 'normal' }
}

export interface ReadingRef {
  id: string
  title: string
}

export type AssignmentType = 'vocab' | 'reading' | 'custom' | 'korean_mock'

/** 학생 과제 페이지의 분류 키. 관리자가 Firestore에서 자유롭게 추가/수정. */
export type AssignmentCategory = string

/** 기본 4종 카테고리 키 (시드 및 유추 기본값에 사용). */
export const BUILTIN_CATEGORY_KEYS = ['problem', 'vocab', 'mock', 'etc'] as const
export type BuiltinCategoryKey = (typeof BUILTIN_CATEGORY_KEYS)[number]

export interface CategoryConfig {
  id: string
  /** Assignment.category 에 저장되는 슬러그. builtin 4종은 'problem'/'vocab'/'mock'/'etc' 고정. */
  key: string
  label: string
  /** HEX 색상 (예: "#0ea5e9"). */
  color: string
  /** 표시 순서 (오름차순). */
  order: number
  /** true 면 키 변경·삭제 불가. */
  builtin?: boolean
}

export const DEFAULT_CATEGORIES: Omit<CategoryConfig, 'id'>[] = [
  { key: 'problem', label: '문제 풀이', color: '#0ea5e9', order: 0, builtin: true },
  { key: 'vocab', label: '단어 시험', color: '#8b5cf6', order: 1, builtin: true },
  { key: 'mock', label: '모의고사', color: '#f43f5e', order: 2, builtin: true },
  { key: 'etc', label: '기타', color: '#10b981', order: 3, builtin: true },
]

export interface Assignment {
  id: string
  studentUid: string
  studentName: string
  assignedBy: string
  assignedByName: string
  type: AssignmentType
  /** 과제 페이지 분류. 없으면 type에서 유추. */
  category?: AssignmentCategory
  refId: string
  refTitle: string
  note?: string
  /** 학생 과제창 노출 시작일. 없으면 즉시 노출. 미래면 그 날짜까지 학생에게 숨김. */
  startAt?: Timestamp | null
  /** For vocab: minimum correct count required to consider done. */
  minCorrect?: number
  /** Admin-toggled completion (legacy). When true, considered done regardless of attempts. */
  manualDone?: boolean
  /**
   * 관리자 수동 완료 오버라이드. 학생 응시 기록과 무관하게 강제.
   * 'done' = 강제 완료, 'undone' = 강제 미완료, 없으면 응시 기록으로 자동 판정.
   */
  manualStatus?: 'done' | 'undone'
  dueAt: Timestamp | null
  createdAt: Timestamp | null
}

/**
 * 관리자 수동 오버라이드 해석. 신규 manualStatus 우선, 없으면 legacy manualDone 호환.
 * 반환: 'done' = 강제 완료, 'undone' = 강제 미완료, null = 자동(응시 기록) 판정.
 */
export function assignmentManualOverride(
  a: Pick<Assignment, 'manualStatus' | 'manualDone'>,
): 'done' | 'undone' | null {
  if (a.manualStatus === 'done' || a.manualStatus === 'undone') return a.manualStatus
  if (a.manualDone) return 'done'
  return null
}

/**
 * 학생 과제창 노출 여부.
 * - startAt이 미래면 아직 숨김.
 * - 'reading'(지문 문제풀이)은 학생 비노출. 영어는 모의고사로 출제하고 지문은
 *   모의고사 오답 리뷰에서 보여주는 방식으로 옮겼다. 이미 부여된 지문 과제도
 *   학생 목록에서 숨긴다. 데이터는 남아 있어 관리자 화면에서는 그대로 보인다.
 *   (되살리려면 이 줄과 Layout.tsx 의 canReading 을 함께 복구할 것)
 *
 * 관리자 화면은 이 함수를 거치지 않으므로 영향받지 않는다.
 */
export function isAssignmentVisibleToStudent(
  a: Assignment,
  now: Date = new Date(),
): boolean {
  if (a.type === 'reading') return false
  if (!a.startAt) return true
  return a.startAt.toMillis() <= now.getTime()
}

/** type에서 기본 분류 키를 유추 (category 필드가 없는 기존 과제 호환). */
export function assignmentCategory(a: Assignment): AssignmentCategory {
  if (a.category) return a.category
  if (a.type === 'vocab') return 'vocab'
  if (a.type === 'reading') return 'problem'
  return 'etc'
}

/** 학생이 직접 관리하는 '기타' 카테고리의 개인 할 일. */
export interface PersonalTodo {
  id: string
  studentUid: string
  text: string
  done: boolean
  createdAt: Timestamp | null
}

export interface PushSchedule {
  id: string
  title: string
  body: string
  enabled: boolean
  cadence: 'daily' | 'weekly'
  /** Sunday=0, Saturday=6. weekly만 사용. */
  dayOfWeek?: number
  hour: number
  minute: number
  /** "students" — 활성 학생 전체. (현재 그대로). */
  audience: 'students'
  lastSentKey?: string
  createdAt: Timestamp | null
}

export interface Announcement {
  id: string
  title: string
  body: string
  pinned?: boolean
  createdBy: string
  createdByName: string
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
}

export type NotificationKind =
  | 'push'
  | 'announcement'
  | 'assignment'
  | 'system'

export interface UserNotification {
  id: string
  recipientUid: string
  title: string
  body: string
  kind?: NotificationKind
  /** 클릭 시 이동할 internal 경로 (예: '/reading/abc'). */
  link?: string
  /** 공지로부터 생성된 알림이면 그 공지의 ID — 공지 삭제 시 같이 삭제. */
  announcementId?: string
  readAt: Timestamp | null
  createdAt: Timestamp | null
}

/** 해설 리치텍스트에서 미리 지정해두는 스타일 (한글 스타일처럼). 전역 공통. */
export interface ExplStyle {
  id: string
  name: string
  bold?: boolean
  underline?: boolean
  /** 글자색 hex. */
  color?: string
  /** 형광색 hex. */
  highlight?: string
  /** 왼쪽 여백 (pt). */
  marginLeft?: number
  /** 오른쪽 여백 (pt). */
  marginRight?: number
  /** 첫 줄 들여쓰기 (pt). 양수=들여쓰기, 음수=내어쓰기. */
  firstLine?: number
}

/** 홈 화면 D-day 카드 (관리자 설정, 전체 공통). */
export interface DDaySetting {
  /** 목표 이름 (예: 2027 대수능). */
  title: string
  /** 목표일 YYYY-MM-DD. */
  dateISO: string
}

/** 학생별 개별 수업 일정 (관리형 캘린더). */
export type ClassSessionStatus =
  | 'scheduled'
  | 'done'
  | 'canceled'
  | 'makeup'
  | 'off'

export const CLASS_SESSION_STATUS_LABEL: Record<ClassSessionStatus, string> = {
  scheduled: '예정',
  done: '완료',
  canceled: '취소',
  makeup: '보강',
  off: '휴강',
}

/** 출석 상태 (수업 기록 시 체크). 미기록이면 세션에 attendance 없음. */
export type SessionAttendance = 'present' | 'late' | 'absent'

export const SESSION_ATTENDANCE_LABEL: Record<SessionAttendance, string> = {
  present: '출석',
  late: '지각',
  absent: '결석',
}

export interface ClassSession {
  id: string
  studentUid: string
  title: string
  /** YYYY-MM-DD, Asia/Seoul 로컬 날짜. */
  dateISO: string
  /** HH:mm 24시간. */
  startTime: string
  endTime: string
  location: string
  /** KRW. */
  cost: number
  status: ClassSessionStatus
  /** 결제 완료 여부. 관리자만 편집. */
  paid?: boolean
  /** 출석 체크(출석/지각/결석). 수업 기록 전에는 undefined. */
  attendance?: SessionAttendance
  /** 수업 일지: 오늘 진행한 내용. */
  lessonContent?: string
  /** 수업 일지: 피드백. */
  feedback?: string
  note?: string
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
}

/**
 * 수업 기록 작성 여부 = 진행 내용/피드백/출석 중 하나라도 있으면 기록된 것으로 본다.
 * (달력의 '완료' vs '기록' 배지 판정에 사용.)
 */
export function isSessionRecorded(s: ClassSession): boolean {
  return (
    !!s.attendance ||
    !!(s.lessonContent && s.lessonContent.trim()) ||
    !!(s.feedback && s.feedback.trim())
  )
}

/** 학생 선불 결제 기록. 잔액 = Σ결제 − Σ(완료된 수업 cost). */
export interface Payment {
  id: string
  studentUid: string
  studentName: string
  /** KRW, 양수. */
  amount: number
  /** 결제일 YYYY-MM-DD (Asia/Seoul). */
  dateISO: string
  note?: string
  createdBy: string
  createdByName: string
  createdAt: Timestamp | null
}

export interface WordLookup {
  en: string
  ko: string
  count: number
  readings: ReadingRef[]
  lastSeenAt: Timestamp | null
}

export function parseWordList(text: string): WordEntry[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // ':' 또는 탭만 구분자로. '-'는 단어 자체(예: stem from, follow-up,
      // back-and-forth)와 충돌하므로 사용하지 않음.
      const m = line.match(/^(.+?)\s*[:\t]\s*(.+)$/)
      if (m) return { en: m[1].trim(), ko: m[2].trim() }
      return { en: line, ko: '' }
    })
    .filter((w) => w.en && w.ko)
}

/**
 * 대괄호 대체 표기를 여러 후보로 확장한다.
 * 예) "확대 [확장]하다" → ["확대 하다", "확대 확장하다", "확장하다", 원본]
 *  - 대괄호 내용 버림(선택 항목 off): 확대하다
 *  - 대괄호만 제거(내용 유지): 확대확장하다
 *  - 앞 단어를 대괄호 내용으로 치환(대체어): 확장하다
 */
function expandBracketVariants(s: string): string[] {
  if (!s.includes('[')) return [s]
  const out = new Set<string>()
  out.add(s)
  out.add(s.replace(/\s*\[[^\]]*\]/g, '')) // 내용 버림
  out.add(s.replace(/[[\]]/g, '')) // 대괄호만 제거
  out.add(s.replace(/(\S+?)\s*\[([^\]]+)\]/g, (_all, _prev, inner) => inner)) // 앞 단어 치환
  return [...out]
}

export function isCorrectKo(userAnswer: string, expected: string): boolean {
  const norm = (s: string) =>
    s.trim().replace(/\s+/g, '').replace(/[.,/·•~∙[\]]/g, '').toLowerCase()
  const user = norm(userAnswer)
  if (!user) return false
  const candidates = expected
    .split(/[,/·•∙、]/)
    .flatMap(expandBracketVariants)
    .map((s) => norm(s))
    .filter(Boolean)
  return candidates.some((c) => c === user || c.includes(user) || user.includes(c))
}
