import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function Dashboard() {
  const { profile } = useAuth()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          안녕하세요, {profile?.displayName}님
        </h1>
        <p className="text-slate-500 mt-1">오늘도 좋은 학습 되세요.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          to="/vocab"
          className="block rounded-lg border border-slate-200 bg-white p-5 hover:border-slate-400 transition"
        >
          <h2 className="text-lg font-semibold text-slate-900">단어 시험지</h2>
          <p className="text-sm text-slate-500 mt-1">
            단어 목록으로 시험지를 만들고 풀어봅니다.
          </p>
        </Link>
        <Link
          to="/reading"
          className="block rounded-lg border border-slate-200 bg-white p-5 hover:border-slate-400 transition"
        >
          <h2 className="text-lg font-semibold text-slate-900">지문 문제풀이</h2>
          <p className="text-sm text-slate-500 mt-1">
            모의고사 지문에 단어 뜻을 함께 제공해, 어휘 약점인지 독해 약점인지 가립니다.
          </p>
        </Link>
      </div>
    </div>
  )
}
