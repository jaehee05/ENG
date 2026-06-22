import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

const iconProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

interface AdminTool {
  to: string
  title: string
  desc: string
  icon: ReactNode
}

const tools: AdminTool[] = [
  {
    to: '/admin/students',
    title: '학생 관리',
    desc: '계정 승인 / 비밀번호 / 시험 이력',
    icon: (
      <svg {...iconProps}>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2 20c0-3 3.5-5 7-5s7 2 7 5" />
        <circle cx="17" cy="9" r="3" />
        <path d="M22 19c0-2.5-2.5-4-5-4" />
      </svg>
    ),
  },
  {
    to: '/admin/notify',
    title: '알림톡 / 푸시',
    desc: '뿌리오 알림톡 · 주간 리포트 · 푸시 발송',
    icon: (
      <svg {...iconProps}>
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
        <path d="M10 21a2 2 0 0 0 4 0" />
      </svg>
    ),
  },
  {
    to: '/admin/announce',
    title: '공지 관리',
    desc: '공지 작성 / 학생 알림함 발송',
    icon: (
      <svg {...iconProps}>
        <path d="m3 11 18-5v12L3 14v-3z" />
        <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
      </svg>
    ),
  },
  {
    to: '/admin/readings',
    title: '지문 관리',
    desc: '지문 등록 / 수정 / 카테고리',
    icon: (
      <svg {...iconProps}>
        <path d="M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2V5Z" />
        <path d="M20 5a2 2 0 0 0-2-2h-5v18h5a2 2 0 0 0 2-2V5Z" />
      </svg>
    ),
  },
  {
    to: '/admin/vocab',
    title: '단어 시험지 관리',
    desc: '시험지 등록 / 단어 재분석',
    icon: (
      <svg {...iconProps}>
        <path d="M9 4h6a2 2 0 0 1 2 2v14l-5-2-5 2V6a2 2 0 0 1 2-2Z" />
        <path d="M9 8h6M9 11h4" />
      </svg>
    ),
  },
  {
    to: '/vocab/corpora',
    title: '교재 관리',
    desc: '단어 교재 / DAY 시험지 자동 생성',
    icon: (
      <svg {...iconProps}>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
      </svg>
    ),
  },
  {
    to: '/admin/korean-mocks',
    title: '모의고사 (국어/영어)',
    desc: '답안 등록 / 학생 OMR 채점 결과 확인',
    icon: (
      <svg {...iconProps}>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    ),
  },
  {
    to: '/admin/categories',
    title: '과제 카테고리',
    desc: '학생 과제 분류 이름·색상 추가/수정',
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="6" r="3" />
        <circle cx="18" cy="12" r="3" />
        <circle cx="12" cy="18" r="3" />
        <circle cx="6" cy="12" r="3" />
      </svg>
    ),
  },
  {
    to: '/admin/class',
    title: '오늘 수업 (Dynamic Island)',
    desc: '잠금화면·다이내믹 아일랜드 수업 표시 입력',
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M8 10h.01M16 10h.01" />
        <path d="M9 14c1 1 5 1 6 0" />
      </svg>
    ),
  },
]

export function AdminHub() {
  return (
    <div className="space-y-5">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          관리
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
          관리자 도구
        </h1>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-2">
        {tools.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-300 hover:bg-slate-50/60 transition"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-700">
              {t.icon}
            </span>
            <p className="mt-3 text-[15px] font-semibold text-slate-900">
              {t.title}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{t.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
