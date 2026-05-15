export const metadata = {
  title: '개인정보처리방침',
};

const COMPANY = '파란대나무숲(주)';
const SERVICE = '파란대나무숲 API 플랫폼';
const EFFECTIVE_DATE = '2026년 5월 16일';
const PRIVACY_OFFICER = '신광현';
const PRIVACY_OFFICER_EMAIL = 'hello@bbforest.net';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-muted/40 py-10 px-4">
      <article className="mx-auto max-w-3xl bg-background rounded-lg border p-8 leading-relaxed">
        <header className="mb-8">
          <h1 className="text-3xl font-bold">개인정보처리방침</h1>
          <p className="text-sm text-muted-foreground mt-2">시행일: {EFFECTIVE_DATE}</p>
        </header>

        <section className="space-y-6 text-sm">
          <p className="text-muted-foreground">
            {COMPANY}(이하 &ldquo;회사&rdquo;)은 「개인정보 보호법」 제30조에 따라 정보주체의 개인정보를 보호하고
            이와 관련한 고충을 신속하고 원활하게 처리할 수 있도록 하기 위하여 다음과 같이 개인정보처리방침을 수립·공개합니다.
          </p>

          <div>
            <h2 className="text-lg font-semibold mb-2">제1조 (개인정보의 처리 목적)</h2>
            <p>회사는 다음의 목적을 위하여 개인정보를 처리합니다. 처리한 개인정보는 다음의 목적 이외의 용도로는 사용되지 않으며, 이용 목적이 변경될 시에는 사전 동의를 구할 예정입니다.</p>
            <ol className="list-decimal pl-5 space-y-1 mt-2">
              <li>회원 가입 및 관리: 회원 가입의사 확인, 본인 식별·인증, 회원자격 유지·관리, 서비스 부정이용 방지</li>
              <li>서비스 제공: 콘텐츠 제공, 본인인증, 알림톡·SMS 발송, 결제·정산</li>
              <li>고충처리: 민원인의 신원 확인, 민원사항 확인, 사실조사를 위한 연락·통지, 처리결과 통보</li>
            </ol>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">제2조 (처리하는 개인정보의 항목)</h2>
            <div className="space-y-2">
              <p className="font-medium">필수항목</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>휴대폰 번호 (본인인증, 로그인 식별자)</li>
                <li>소셜 로그인 사용 시: 카카오/네이버/구글이 제공하는 식별자, 이메일, 닉네임</li>
              </ul>
              <p className="font-medium mt-2">자동 수집 항목</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>접속 IP, 쿠키, 서비스 이용 기록, 기기 정보 (브라우저·OS)</li>
              </ul>
              <p className="font-medium mt-2">선택항목</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>프로필 사진, 추가 연락처 등 회원이 직접 입력한 정보</li>
              </ul>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">제3조 (개인정보의 처리 및 보유 기간)</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>회원 정보: 회원 탈퇴 시까지. 단, 부정이용 방지를 위해 탈퇴 후 30일간 휴대폰 번호 해시값 보관 가능.</li>
              <li>관계 법령에 따른 보존
                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                  <li>계약 또는 청약철회 등에 관한 기록: 5년 (전자상거래 등에서의 소비자보호에 관한 법률)</li>
                  <li>대금결제 및 재화 등의 공급에 관한 기록: 5년 (동법)</li>
                  <li>소비자의 불만 또는 분쟁처리에 관한 기록: 3년 (동법)</li>
                  <li>웹사이트 방문기록: 3개월 (통신비밀보호법)</li>
                </ul>
              </li>
            </ol>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">제4조 (개인정보의 제3자 제공)</h2>
            <p>회사는 정보주체의 개인정보를 제1조(개인정보의 처리 목적)에서 명시한 범위 내에서만 처리하며, 정보주체의 동의, 법률의 특별한 규정 등 「개인정보 보호법」 제17조 및 제18조에 해당하는 경우에만 개인정보를 제3자에게 제공합니다.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">제5조 (개인정보 처리의 위탁)</h2>
            <p>회사는 원활한 서비스 제공을 위해 다음과 같이 개인정보 처리업무를 위탁하고 있습니다.</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>알림톡·SMS 발송: 알리고 (Aligo)</li>
              <li>결제 처리: 페이앱 (Payapp)</li>
              <li>소셜 로그인: 카카오, 네이버, 구글</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">제6조 (정보주체의 권리·의무 및 행사방법)</h2>
            <p>정보주체는 회사에 대해 언제든지 다음 각 호의 권리를 행사할 수 있습니다.</p>
            <ol className="list-decimal pl-5 space-y-1 mt-2">
              <li>개인정보 열람 요구</li>
              <li>오류 등이 있을 경우 정정 요구</li>
              <li>삭제 요구</li>
              <li>처리정지 요구</li>
            </ol>
            <p className="mt-2">
              위 권리 행사는 서비스 내 설정 메뉴 또는 개인정보 보호책임자에게 서면, 전자우편 등을 통하여 하실 수 있으며,
              회사는 이에 대해 지체 없이 조치하겠습니다.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">제7조 (개인정보의 안전성 확보 조치)</h2>
            <p>회사는 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고 있습니다.</p>
            <ol className="list-decimal pl-5 space-y-1 mt-2">
              <li>관리적 조치: 내부관리계획 수립·시행, 정기적 직원 교육</li>
              <li>기술적 조치: 개인정보처리시스템 등의 접근권한 관리, 접근통제시스템 설치, 비밀번호의 암호화, 보안프로그램 설치</li>
              <li>물리적 조치: 전산실, 자료보관실 등의 접근통제</li>
            </ol>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">제8조 (개인정보 보호책임자)</h2>
            <p>회사는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보 처리와 관련한 정보주체의 불만처리 및 피해구제 등을 위하여 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>성명: {PRIVACY_OFFICER}</li>
              <li>연락처: {PRIVACY_OFFICER_EMAIL}</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">제9조 (권익침해 구제방법)</h2>
            <p>정보주체는 개인정보 침해로 인한 구제를 받기 위하여 개인정보보호위원회, 한국인터넷진흥원 개인정보침해신고센터 등에 분쟁해결이나 상담 등을 신청할 수 있습니다.</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>개인정보보호위원회 (privacy.go.kr / 국번없이 182)</li>
              <li>개인정보침해신고센터 (privacy.kisa.or.kr / 국번없이 118)</li>
              <li>대검찰청 사이버수사과 (spo.go.kr / 국번없이 1301)</li>
              <li>경찰청 사이버수사국 (ecrm.cyber.go.kr / 국번없이 182)</li>
            </ul>
          </div>

          <div className="pt-4 border-t">
            <h2 className="text-lg font-semibold mb-2">부칙</h2>
            <p>본 방침은 {EFFECTIVE_DATE}부터 시행합니다.</p>
          </div>
        </section>
      </article>
    </main>
  );
}
