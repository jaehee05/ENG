/** 학생별 색상 팔레트 (관리자 캘린더 뷰용). */
export interface StudentColor {
  key: StudentColorKey
  label: string
  /** 캘린더 이벤트 점 배경. */
  dot: string
  /** 인액티브 pill (연한 배경 + 진한 텍스트 + 테두리). */
  badge: string
  /** 액티브 pill (진한 배경 + 흰 텍스트). */
  active: string
}

export const STUDENT_COLOR_KEYS = [
  'sky',
  'emerald',
  'amber',
  'violet',
  'rose',
  'teal',
  'indigo',
  'orange',
] as const

export type StudentColorKey = (typeof STUDENT_COLOR_KEYS)[number]

export const STUDENT_COLORS: Record<StudentColorKey, StudentColor> = {
  sky: {
    key: 'sky',
    label: '하늘',
    dot: 'bg-sky-500',
    badge: 'bg-sky-50 text-sky-700 border-sky-200',
    active: 'bg-sky-600 text-white border-sky-600',
  },
  emerald: {
    key: 'emerald',
    label: '민트',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    active: 'bg-emerald-600 text-white border-emerald-600',
  },
  amber: {
    key: 'amber',
    label: '앰버',
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-800 border-amber-200',
    active: 'bg-amber-500 text-white border-amber-500',
  },
  violet: {
    key: 'violet',
    label: '보라',
    dot: 'bg-violet-500',
    badge: 'bg-violet-50 text-violet-700 border-violet-200',
    active: 'bg-violet-600 text-white border-violet-600',
  },
  rose: {
    key: 'rose',
    label: '로즈',
    dot: 'bg-rose-500',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    active: 'bg-rose-600 text-white border-rose-600',
  },
  teal: {
    key: 'teal',
    label: '틸',
    dot: 'bg-teal-500',
    badge: 'bg-teal-50 text-teal-700 border-teal-200',
    active: 'bg-teal-600 text-white border-teal-600',
  },
  indigo: {
    key: 'indigo',
    label: '인디고',
    dot: 'bg-indigo-500',
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    active: 'bg-indigo-600 text-white border-indigo-600',
  },
  orange: {
    key: 'orange',
    label: '오렌지',
    dot: 'bg-orange-500',
    badge: 'bg-orange-50 text-orange-700 border-orange-200',
    active: 'bg-orange-600 text-white border-orange-600',
  },
}

export function isStudentColorKey(v: unknown): v is StudentColorKey {
  return (
    typeof v === 'string' &&
    (STUDENT_COLOR_KEYS as readonly string[]).includes(v)
  )
}

/** uid 기반 결정적 색상 (관리자가 지정하지 않았을 때 폴백). */
function hashColorKey(uid: string): StudentColorKey {
  let h = 0
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0
  return STUDENT_COLOR_KEYS[h % STUDENT_COLOR_KEYS.length]
}

/** 학생 계정에서 색상을 뽑는다. colorKey 가 있으면 그 색상, 없으면 uid 해시. */
export function colorForStudent(
  uid: string,
  explicit?: string | null,
): StudentColor {
  const key = isStudentColorKey(explicit) ? explicit : hashColorKey(uid)
  return STUDENT_COLORS[key]
}
