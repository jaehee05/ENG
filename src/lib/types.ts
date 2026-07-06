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
  /** iOS Capacitor 앱에서 받은 FCM 디바이스 토큰들 (다중 기기 지원). */
  fcmTokens?: string[]
  createdAt: Timestamp | null
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

export interface VocabSet {
  id: string
  title: string
  words: WordEntry[]
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
  /** 소유 학생 UID. 없으면 legacy(공용). */
  studentUid?: string
  studentName?: string
  lastDayNumber: number
  maxAttempts?: number
  /** Master word list — all words that may be used to spawn DAY tests. */
  words?: WordEntry[]
  /** Default words per DAY when generating next test. */
  perDay?: number
  /** How many words have already been used in DAY tests (cursor). */
  usedCount?: number
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
  userAnswer: string
  correct: boolean
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
  questions: KoreanMockQuestion[]
  createdAt: Timestamp | null
  createdBy: string
  createdByName: string
}

export function getMockSubject(m: KoreanMock): MockSubject {
  return m.subject ?? 'korean'
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

/** 학생 과제창 노출 여부. startAt이 미래면 아직 숨김. */
export function isAssignmentVisibleToStudent(
  a: Assignment,
  now: Date = new Date(),
): boolean {
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

/** 학생별 개별 수업 일정 (관리형 캘린더). */
export type ClassSessionStatus = 'scheduled' | 'done' | 'canceled' | 'makeup'

export const CLASS_SESSION_STATUS_LABEL: Record<ClassSessionStatus, string> = {
  scheduled: '예정',
  done: '완료',
  canceled: '취소',
  makeup: '보강',
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
  note?: string
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
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

export function isCorrectKo(userAnswer: string, expected: string): boolean {
  const norm = (s: string) =>
    s.trim().replace(/\s+/g, '').replace(/[.,/·•~∙]/g, '').toLowerCase()
  const user = norm(userAnswer)
  if (!user) return false
  const candidates = expected
    .split(/[,/·•∙、]/)
    .map((s) => norm(s))
    .filter(Boolean)
  return candidates.some((c) => c === user || c.includes(user) || user.includes(c))
}
