import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'

const cards = [
  {
    to: '/vocab',
    title: '단어 시험지',
    desc: '단어셋으로 시험지를 만들고 풀어봅니다.',
    gradient: 'from-indigo-500 to-blue-500',
  },
  {
    to: '/reading',
    title: '지문 문제풀이',
    desc: '단어 뜻을 함께 제공해 어휘·독해 약점을 가립니다.',
    gradient: 'from-violet-500 to-fuchsia-500',
  },
  {
    to: '/wordbook',
    title: '내 단어장',
    desc: '지문에서 누른 단어가 자동으로 모입니다.',
    gradient: 'from-emerald-500 to-teal-500',
  },
]

export function Dashboard() {
  const { profile } = useAuth()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          안녕하세요, {profile?.displayName}님
        </h1>
        <p className="text-slate-500 mt-2">오늘도 좋은 학습 되세요.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className="group relative block rounded-2xl border border-slate-200 bg-white p-6 hover:shadow-lg hover:-translate-y-0.5 transition overflow-hidden"
          >
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${c.gradient}`} />
            <h2 className="text-lg font-semibold text-slate-900">{c.title}</h2>
            <p className="text-sm text-slate-500 mt-2 leading-relaxed">{c.desc}</p>
            <span className="absolute bottom-4 right-5 text-slate-400 group-hover:text-slate-900 transition text-lg">
              →
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
