import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { listAccounts } from '../lib/account'

const iconProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** 아이콘 타일 색. 영역마다 다른 색을 줘 한눈에 구분되게 한다. */
type Tone = 'brand' | 'sky' | 'amber' | 'slate'

const TONE_CLASS: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand-700 ring-brand-100',
  sky: 'bg-sky-50 text-sky-700 ring-sky-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
}

interface AdminTool {
  to: string
  title: string
  desc: string
  tone: Tone
  icon: ReactNode
  /** 이 도구에서 지금 처리할 게 몇 건인지. 0이면 표시하지 않는다. */
  badge?: number
}

interface ToolGroup {
  label: string
  hint: string
  tools: AdminTool[]
}

export function AdminHub() {
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    let alive = true
    listAccounts()
      .then((all) => {
        if (!alive) return
        setPendingCount(
          all.filter((a) => a.role === 'student' && a.status === 'pending').length,
        )
      })
      .catch(() => {
        // 보조 정보. 실패해도 허브는 보여야 한다.
      })
    return () => {
      alive = false
    }
  }, [])

  const groups: ToolGroup[] = [
    {
      label: '학생 · 운영',
      hint: '매일 들여다보는 것들',
      tools: [
        {
          to: '/admin/students',
          title: '학생 관리',
          desc: '계정 승인 · 과제 · 시험 이력 · 일정',
          tone: 'brand',
          badge: pendingCount,
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
          to: '/admin/payments',
          title: '결제 · 정산',
          desc: '수입 확인 · 선불 잔액 · 결제 필요일',
          tone: 'brand',
          icon: (
            <svg {...iconProps}>
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <path d="M2 10h20" />
              <path d="M6 15h4" />
            </svg>
          ),
        },
        {
          to: '/admin/availability',
          title: '가능시간 공유',
          desc: '빈 시간대 골라 학부모에게 전달',
          tone: 'brand',
          icon: (
            <svg {...iconProps}>
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
              <path d="m9 16 2 2 4-4" />
            </svg>
          ),
        },
      ],
    },
    {
      label: '학습 콘텐츠',
      hint: '학생에게 낼 것을 만드는 곳',
      tools: [
        {
          to: '/vocab/corpora',
          title: '단어 교재',
          desc: '마스터 단어 등록 · 학생별 DAY 시험지 생성',
          tone: 'sky',
          icon: (
            <svg {...iconProps}>
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
            </svg>
          ),
        },
        {
          to: '/admin/korean-mocks',
          title: '모의고사',
          desc: '국어·영어 답안 등록 · 해설 · 오답 지문',
          tone: 'sky',
          icon: (
            <svg {...iconProps}>
              <rect x="4" y="3" width="16" height="18" rx="2" />
              <path d="M8 8h8M8 12h8M8 16h5" />
            </svg>
          ),
        },
        {
          to: '/admin/vocab',
          title: '생성된 단어 시험지',
          desc: '만들어진 시험지 확인 · 인쇄 · 삭제',
          tone: 'sky',
          icon: (
            <svg {...iconProps}>
              <path d="M9 4h6a2 2 0 0 1 2 2v14l-5-2-5 2V6a2 2 0 0 1 2-2Z" />
              <path d="M9 8h6M9 11h4" />
            </svg>
          ),
        },
      ],
    },
    {
      label: '소통 · 설정',
      hint: '가끔 손대는 것들',
      tools: [
        {
          to: '/admin/notify',
          title: '알림톡 · 푸시',
          desc: '뿌리오 알림톡 · 주간 리포트 · 푸시 발송',
          tone: 'amber',
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
          desc: '공지 작성 · 학생 알림함 발송',
          tone: 'amber',
          icon: (
            <svg {...iconProps}>
              <path d="m3 11 18-5v12L3 14v-3z" />
              <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
            </svg>
          ),
        },
        {
          to: '/admin/categories',
          title: '과제 카테고리',
          desc: '과제 분류 이름 · 색상',
          tone: 'slate',
          icon: (
            <svg {...iconProps}>
              <circle cx="12" cy="6" r="3" />
              <circle cx="18" cy="12" r="3" />
              <circle cx="12" cy="18" r="3" />
              <circle cx="6" cy="12" r="3" />
            </svg>
          ),
        },
      ],
    },
  ]

  return (
    <div className="space-y-7">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            관리
          </p>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
            관리자 도구
          </h1>
        </div>
        {pendingCount > 0 && (
          <Link
            to="/admin/students"
            className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 transition"
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
            승인 대기 {pendingCount}명
          </Link>
        )}
      </header>

      {groups.map((g) => (
        <section key={g.label} className="space-y-2.5">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[13px] font-semibold text-slate-900">{g.label}</h2>
            <p className="text-[11px] text-slate-400">{g.hint}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2">
            {g.tools.map((t) => (
              <Link
                key={t.to}
                to={t.to}
                className="group relative flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 touch:p-5 hover:border-slate-300 hover:shadow-soft transition"
              >
                <span
                  className={`shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${TONE_CLASS[t.tone]}`}
                >
                  {t.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[15px] font-semibold text-slate-900">
                      {t.title}
                    </span>
                    {t.badge != null && t.badge > 0 && (
                      <span className="inline-block rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        {t.badge}
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-slate-500 mt-0.5 leading-relaxed">
                    {t.desc}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="shrink-0 self-center text-slate-300 group-hover:text-slate-400 transition"
                >
                  ›
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
