/**
 * 개인정보 처리방침.
 *
 * 내용을 고칠 때는 앱이 실제로 하는 일과 어긋나지 않는지 먼저 보라. 특히
 * 수집 항목(lib/types.ts 의 UserAccount)과 처리위탁 목록(functions/, api/)이
 * 그렇다. 방침에 적힌 것과 코드가 다르면 그게 가장 나쁜 종류의 오류다.
 *
 * 탈퇴 시 실제로 지우는 범위는 functions/auth.js 의 purgeStudentData 에 있다.
 */

import { useNavigate } from 'react-router-dom'

const UPDATED = '2026년 8월 3일'
const CONTACT = 'support@kjhedu.kr'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-bold text-slate-900">{title}</h2>
      <div className="text-[13px] leading-relaxed text-slate-600 space-y-2">
        {children}
      </div>
    </section>
  )
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="bg-slate-50">
            {head.map((h) => (
              <th
                key={h}
                className="border border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-700 whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.join()}>
              {r.map((cell, i) => (
                <td
                  key={i}
                  className="border border-slate-200 px-2 py-1.5 align-top text-slate-600"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Privacy() {
  const navigate = useNavigate()

  return (
    // 로그인 없이 여는 화면이라 Layout(헤더·탭바) 밖에 있다. 돌아갈 길을
    // 여기서 직접 낸다 — 기록이 없으면(링크로 바로 열린 경우) 홈으로.
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
            개인정보 처리방침
          </h1>
          <p className="text-xs text-slate-500 mt-1">최종 업데이트 {UPDATED}</p>
        </header>

        <p className="text-[13px] leading-relaxed text-slate-600">
          케이제이에이치에듀(이하 &lsquo;학원&rsquo;)는 KJHEDU 애플리케이션 및 웹
          서비스(이하 &lsquo;서비스&rsquo;) 이용자의 개인정보를 소중히 다루며,
          「개인정보 보호법」 등 관련 법령을 준수합니다. 본 방침은 학원이 어떤 정보를
          어떤 목적으로 다루는지, 이용자가 어떤 권리를 갖는지 설명합니다.
        </p>
        <p className="text-[13px] leading-relaxed text-slate-600">
          서비스는 학원에 등록한 고등학생을 대상으로 하며, 만 14세 미만 아동을 대상으로
          하지 않습니다.
        </p>

        <Section title="1. 수집하는 개인정보 항목">
          <Table
            head={['구분', '항목', '수집 방법']}
            rows={[
              [
                '필수',
                '이메일(로그인 아이디), 비밀번호, 이름, 전화번호',
                '회원가입 시 이용자 입력',
              ],
              ['필수', '학부모 전화번호', '회원가입 시 이용자 입력'],
              ['선택', '학교, 수강 과목', '회원가입 또는 학원 등록 시'],
              [
                '서비스 이용 중 생성',
                '시험 응시 내역·점수·제출한 답안, 과제 수행 내역, 수업 일정, 찾아본 단어',
                '서비스 이용 과정에서 자동 생성',
              ],
              ['서비스 이용 중 생성', '수강료 수납 기록', '학원이 입력'],
              ['자동 수집', '푸시 알림 토큰', '앱에서 알림을 허용한 경우'],
            ]}
          />
          <p>
            학부모 전화번호는 학습 현황 안내를 받으실 보호자의 연락처입니다. 이용자
            본인이 아닌 제3자의 정보이므로, 입력 전 보호자에게 알리고 동의를 받아 주시기
            바랍니다.
          </p>
        </Section>

        <Section title="2. 개인정보의 이용 목적">
          <ul className="list-disc pl-4 space-y-1">
            <li>회원 식별 및 로그인, 학원 등록 학생 여부 확인</li>
            <li>시험 출제·응시·채점 및 학습 기록 제공</li>
            <li>과제·수업 일정 안내, 공지사항 및 알림 발송</li>
            <li>학습 현황의 보호자 안내(알림톡)</li>
            <li>수강료 수납 관리</li>
            <li>문의 응대 및 서비스 개선</li>
          </ul>
        </Section>

        <Section title="3. 보유 및 이용 기간, 파기">
          <p>
            원칙적으로 회원 탈퇴 시 지체 없이 파기합니다. 앱의{' '}
            <b className="font-semibold text-slate-800">더보기 &gt; 회원탈퇴</b>
            에서 직접 탈퇴할 수 있으며, 탈퇴와 동시에 계정 정보, 시험 응시 내역, 과제,
            수업 일정, 알림 내역, 찾아본 단어가 함께 삭제됩니다.
          </p>
          <p>
            다만 <b className="font-semibold text-slate-800">수강료 수납 기록</b>은 거래
            증빙에 해당하여 관련 법령에서 정한 기간 동안 보관한 후 파기합니다.
          </p>
          <p>전자적 파일은 복구할 수 없는 방법으로 삭제합니다.</p>
        </Section>

        <Section title="4. 개인정보 처리의 위탁">
          <p>
            학원은 서비스 제공을 위해 아래와 같이 처리를 위탁하고 있으며, 위탁받은
            업체가 개인정보를 목적 외로 이용하지 않도록 관리·감독합니다.
          </p>
          <Table
            head={['수탁자', '위탁 업무', '이전 국가']}
            rows={[
              ['Google LLC (Firebase)', '데이터 보관, 푸시 알림 발송', '미국'],
              ['Vercel Inc.', '웹 서비스 호스팅', '미국'],
              ['㈜뿌리오', '학습 현황 알림톡 발송 (이름·연락처)', '대한민국'],
              [
                'Anthropic PBC',
                '단어 시험 자동 채점(제출한 답), 지문 번역·해설 생성',
                '미국',
              ],
              ['Capgo', '애플리케이션 업데이트 배포', '국외'],
            ]}
          />
          <p>
            이전 항목·시기·방법은 위 업무 수행 시점에 네트워크를 통해 전송되는 방식이며,
            이용자는 개인정보의 국외 이전을 거부할 수 있습니다. 다만 이 경우 서비스
            이용이 제한될 수 있습니다.
          </p>
        </Section>

        <Section title="5. 개인정보의 제3자 제공">
          <p>
            학원은 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만 법령에 따라
            요구되거나 수사기관이 적법한 절차에 따라 요청하는 경우에는 예외로 합니다.
          </p>
        </Section>

        <Section title="6. 이용자와 법정대리인의 권리">
          <p>
            이용자는 언제든지 개인정보의 열람·정정·삭제·처리정지를 요청할 수 있고,
            수집·이용 동의를 철회할 수 있습니다. 앱의{' '}
            <b className="font-semibold text-slate-800">더보기 &gt; 내 정보 관리</b>
            에서 직접 확인·수정할 수 있으며, 그 밖의 요청은 아래 연락처로 하시면 지체
            없이 처리합니다.
          </p>
        </Section>

        <Section title="7. 개인정보의 안전성 확보 조치">
          <ul className="list-disc pl-4 space-y-1">
            <li>비밀번호는 복호화할 수 없는 방식으로 암호화하여 저장합니다.</li>
            <li>
              계정 정보는 서버를 통해서만 접근할 수 있도록 제한하고, 관리자 권한이
              필요한 작업은 서버에서 권한을 확인합니다.
            </li>
            <li>개인정보를 다루는 인원을 최소한으로 두고 접근 권한을 관리합니다.</li>
            <li>전송 구간은 암호화(HTTPS)합니다.</li>
          </ul>
        </Section>

        <Section title="8. 개인정보 보호책임자 및 문의">
          <Table
            head={['구분', '내용']}
            rows={[
              ['개인정보 보호책임자', '김재희 (대표)'],
              ['문의', CONTACT],
            ]}
          />
          <p>
            개인정보 침해로 인한 상담·신고가 필요하시면 아래 기관에 문의하실 수
            있습니다.
          </p>
          <ul className="list-disc pl-4 space-y-1">
            <li>개인정보분쟁조정위원회 (kopico.go.kr / 1833-6972)</li>
            <li>개인정보침해신고센터 (privacy.kisa.or.kr / 118)</li>
            <li>대검찰청 사이버수사과 (spo.go.kr / 1301)</li>
            <li>경찰청 사이버수사국 (ecrm.police.go.kr / 182)</li>
          </ul>
        </Section>

        <Section title="9. 방침의 변경">
          <p>
            본 방침이 변경되는 경우 시행 7일 전(이용자에게 불리한 중요한 변경은 30일
            전)부터 서비스 내 공지사항을 통해 알려드립니다.
          </p>
          <p className="text-slate-500">최종 업데이트 및 시행일: {UPDATED}</p>
        </Section>
      </div>
    </div>
  )
}
