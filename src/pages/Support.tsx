/**
 * 고객지원. App Store Connect 의 지원 URL(필수)로 쓴다.
 *
 * 심사자가 열어보는 페이지이기도 하다. 로그인 밖에 두어 누구나 볼 수 있어야
 * 하고, 404 가 나면 그대로 반려다.
 *
 * 안내 내용은 앱이 실제로 하는 일과 맞아야 한다. 특히 비밀번호는 스스로
 * 재설정하는 길이 없고(관리자가 setAccountPassword 로 넣어준다), 가입 직후에는
 * status 가 pending 이라 승인 전까지 아무것도 못 본다.
 */

import { Link, useNavigate } from 'react-router-dom'

const CONTACT = 'support@kjhedu.kr'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-bold text-slate-900">{title}</h2>
      <div className="text-[13px] leading-relaxed text-slate-600 space-y-2">{children}</div>
    </section>
  )
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-1.5">
      <p className="text-[13px] font-semibold text-slate-900">{q}</p>
      <div className="text-[13px] leading-relaxed text-slate-600 space-y-1.5">{children}</div>
    </div>
  )
}

export function Support() {
  const navigate = useNavigate()

  return (
    // 개인정보 처리방침과 같은 이유로 Layout(헤더·탭바) 밖에 있다.
    // 네이티브 앱은 body 스크롤을 막아 둔다(index.css 의 .native-app). Layout 은
    // 자기 안에 스크롤 영역을 두는데 이 화면은 Layout 밖이라, 여기서 직접 만든다.
    <div className="h-dvh overflow-y-auto overscroll-contain bg-white">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-5 safe-top space-y-6 pb-10">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
          className="-ml-2 h-9 px-2 inline-flex items-center gap-0.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          <span aria-hidden>‹</span> 뒤로
        </button>

        <header>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            KJHEDU
          </p>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
            고객지원
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            KJHEDU 는 케이제이에이치에듀에 등록한 학생을 위한 학습 관리 앱입니다.
          </p>
        </header>

        <Section title="문의하기">
          <p>
            아래 이메일로 보내주시면 확인하는 대로 답변드립니다. 앱 화면 이름과
            겪으신 상황을 함께 적어주시면 더 빠르게 도와드릴 수 있습니다.
          </p>
          <p>
            <a
              href={`mailto:${CONTACT}`}
              className="text-base font-semibold text-slate-900 underline underline-offset-4"
            >
              {CONTACT}
            </a>
          </p>
          <p className="text-slate-500">
            수업 시간표·수강 관련 문의는 학원으로 직접 연락해 주세요.
          </p>
        </Section>

        <Section title="자주 묻는 질문">
          <div className="space-y-2.5">
            <Faq q="가입했는데 “승인 대기” 화면에서 넘어가지 않습니다.">
              <p>
                KJHEDU 는 학원에 등록한 학생만 이용할 수 있습니다. 가입 후 학원에서
                확인하고 승인하면 바로 이용할 수 있습니다.
              </p>
              <p>
                한참 지나도 그대로라면 가입할 때 쓴 이름·전화번호가 학원에 등록된
                정보와 다를 수 있으니 학원으로 문의해 주세요.
              </p>
            </Faq>

            <Faq q="비밀번호를 잊어버렸습니다.">
              <p>
                앱에서 직접 재설정하는 기능은 없습니다. 학원으로 알려주시면 새
                비밀번호를 지정해 드립니다.
              </p>
            </Faq>

            <Faq q="알림이 오지 않습니다.">
              <p>
                <b className="font-semibold text-slate-800">더보기 &gt; 알림</b>이 켜져
                있는지 확인해 주세요. 알림은 기기마다 따로 설정되어, 한 기기에서 끄면
                그 기기에만 적용됩니다.
              </p>
              <p>
                켜져 있는데도 오지 않으면 기기의{' '}
                <b className="font-semibold text-slate-800">설정 &gt; 알림</b>에서 KJHEDU
                알림이 허용되어 있는지 봐주세요. 앱 안에서는 이 설정을 바꿀 수 없습니다.
              </p>
            </Faq>

            <Faq q="이름이나 전화번호가 잘못되어 있습니다.">
              <p>
                <b className="font-semibold text-slate-800">더보기 &gt; 내 정보 관리</b>
                에서 직접 고칠 수 있습니다.
              </p>
            </Faq>

            <Faq q="탈퇴하고 싶습니다.">
              <p>
                <b className="font-semibold text-slate-800">더보기 &gt; 회원탈퇴</b>에서
                직접 탈퇴할 수 있습니다. 탈퇴하면 계정과 함께 시험 응시 내역, 과제, 수업
                일정, 알림 내역이 모두 삭제되며 되돌릴 수 없습니다.
              </p>
              <p>
                수강료 수납 기록은 거래 증빙이라 관련 법령에서 정한 기간 동안 보관한 뒤
                파기합니다. 자세한 내용은{' '}
                <Link to="/privacy" className="text-slate-700 underline underline-offset-2">
                  개인정보 처리방침
                </Link>
                을 봐주세요.
              </p>
            </Faq>

            <Faq q="시험을 보는 중에 앱이 닫혔습니다.">
              <p>
                제출하기 전의 답안은 저장되지 않습니다. 시험지를 다시 열어 처음부터
                응시해 주세요. 이미 제출한 시험의 결과는{' '}
                <b className="font-semibold text-slate-800">더보기 &gt; 내 기록</b>에서 다시
                볼 수 있습니다.
              </p>
            </Faq>
          </div>
        </Section>

        <Section title="개인정보">
          <p>
            수집하는 정보와 이용 목적, 보관 기간은{' '}
            <Link to="/privacy" className="text-slate-700 underline underline-offset-2">
              개인정보 처리방침
            </Link>
            에 정리해 두었습니다.
          </p>
        </Section>
      </div>
    </div>
  )
}
