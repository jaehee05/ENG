import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'

const cards = [
  {
    to: '/vocab',
    title: '단어 시험지',
    desc: '단어셋으로 시험지를 만들고 풀어봅니다.',
    initial: '단',
    gradient: 'from-indigo-500 to-blue-500',
    ring: 'group-hover:ring-indigo-200',
  },
  {
    to: '/reading',
    title: '지문 문제풀이',
    desc: '단어 뜻을 함께 제공해 어휘·독해 약점을 가립니다.',
    initial: '지',
    gradient: 'from-violet-500 to-fuchsia-500',
    ring: 'group-hover:ring-violet-200',
  },
  {
    to: '/wordbook',
    title: '내 단어장',
    desc: '지문에서 누른 단어가 자동으로 모입니다.',
    initial: '내',
    gradient: 'from-emerald-500 to-teal-500',
    ring: 'group-hover:ring-emerald-200',
  },
]

export function Dashboard() {
  const { profile } = useAuth()
  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 6) return '늦었어요'
    if (h < 12) return '좋은 아침이에요'
    if (h < 18) return '좋은 오후예요'
    return '좋은 저녁이에요'
  })()

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-8 sm:p-10 text-white shadow-lift">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -left-10 -bottom-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <p className="relative text-xs uppercase tracking-[0.18em] text-white/70">
          {greeting}
        </p>
        <h1 className="relative mt-3 text-3xl sm:text-4xl font-bold leading-tight">
          {profile?.displayName}님,<br className="sm:hidden" /> 오늘도 한 걸음 더.
        </h1>
        <p className="relative mt-3 text-sm sm:text-base text-white/80 max-w-md">
          단어를 다지고, 지문을 분석하고, 모은 단어로 시험까지 봅니다.
        </p>
      </section>

      <section>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {cards.map((c) => (
            <Link
              key={c.to}
              to={c.to}
              className="group relative block rounded-2xl border border-slate-200 bg-white p-6 shadow-soft hover:shadow-lift hover:-translate-y-0.5 transition-all"
            >
              <div
                className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${c.gradient} text-white font-bold text-lg shadow-md ring-4 ring-white ${c.ring}`}
              >
                {c.initial}
              </div>
              <h2 className="mt-5 text-lg font-semibold text-slate-900">{c.title}</h2>
              <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">{c.desc}</p>
              <span className="absolute bottom-6 right-6 text-slate-300 group-hover:text-slate-900 transition text-xl">
                →
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
