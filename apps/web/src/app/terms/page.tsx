export const metadata = {
  title: '이용약관',
};

const COMPANY = '파란대나무숲(주)';
const SERVICE = '파란대나무숲 API 플랫폼';
const EFFECTIVE_DATE = '2026년 5월 16일';

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-muted/40 py-10 px-4">
      <article className="mx-auto max-w-3xl bg-background rounded-lg border p-8 leading-relaxed">
        <header className="mb-8">
          <h1 className="text-3xl font-bold">이용약관</h1>
          <p className="text-sm text-muted-foreground mt-2">시행일: {EFFECTIVE_DATE}</p>
        </header>

        <section className="space-y-6 text-sm">
          <div>
            <h2 className="text-lg font-semibold mb-2">제1조 (목적)</h2>
            <p>
              본 약관은 {COMPANY}(이하 &ldquo;회사&rdquo;)이 제공하는 {SERVICE}(이하 &ldquo;서비스&rdquo;)의 이용과 관련하여
              회사와 이용자 간의 권리, 의무 및 책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">제2조 (정의)</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>&ldquo;서비스&rdquo;라 함은 회사가 제공하는 모든 온라인 서비스를 의미합니다.</li>
              <li>&ldquo;이용자&rdquo;라 함은 본 약관에 따라 회사가 제공하는 서비스를 이용하는 회원 및 비회원을 말합니다.</li>
              <li>&ldquo;회원&rdquo;이라 함은 회사에 개인정보를 제공하여 회원등록을 한 자로서, 회사의 정보를 지속적으로 제공받으며 회사가 제공하는 서비스를 계속적으로 이용할 수 있는 자를 말합니다.</li>
            </ol>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">제3조 (약관의 효력 및 변경)</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>본 약관은 서비스 화면에 게시하거나 기타의 방법으로 공지함으로써 효력을 발생합니다.</li>
              <li>회사는 필요한 경우 관련 법령을 위배하지 않는 범위에서 본 약관을 변경할 수 있으며, 변경된 약관은 적용일자 7일 전부터 공지합니다. 다만, 이용자에게 불리한 변경의 경우 30일 전부터 공지합니다.</li>
              <li>이용자가 변경된 약관에 동의하지 않을 경우 서비스 이용을 중단하고 탈퇴할 수 있습니다.</li>
            </ol>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">제4조 (이용계약의 성립)</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>이용계약은 이용자가 본 약관에 동의하고 회사가 정한 가입 양식에 따라 회원정보를 기입한 후 가입신청을 하면 회사가 이를 승낙함으로써 성립합니다.</li>
              <li>회사는 다음 각 호에 해당하는 가입신청에 대하여는 승낙을 하지 않거나 사후에 이용계약을 해지할 수 있습니다.
                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                  <li>실명이 아니거나 타인의 명의를 이용하여 신청한 경우</li>
                  <li>허위의 정보를 기재하거나 회사가 요구하는 내용을 기재하지 않은 경우</li>
                  <li>기타 회사가 정한 이용신청 요건이 미비된 경우</li>
                </ul>
              </li>
            </ol>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">제5조 (서비스의 제공 및 변경)</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>회사는 이용자에게 서비스를 24시간 제공하는 것을 원칙으로 합니다. 다만, 시스템 점검, 통신장애, 천재지변 등 부득이한 사유가 있는 경우 일시적으로 중단될 수 있습니다.</li>
              <li>회사는 운영상·기술상의 필요에 따라 제공하고 있는 서비스의 전부 또는 일부를 변경할 수 있으며, 이 경우 변경된 서비스의 내용 및 제공일자를 사전에 공지합니다.</li>
            </ol>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">제6조 (회원의 의무)</h2>
            <p>회원은 다음 행위를 하여서는 안 됩니다.</p>
            <ol className="list-decimal pl-5 space-y-1 mt-1">
              <li>신청 또는 변경 시 허위 내용의 등록</li>
              <li>타인의 정보 도용</li>
              <li>회사가 게시한 정보의 변경</li>
              <li>회사가 정한 정보 이외의 정보 등의 송신 또는 게시</li>
              <li>회사 및 기타 제3자의 저작권 등 지적재산권에 대한 침해</li>
              <li>회사 및 기타 제3자의 명예를 손상시키거나 업무를 방해하는 행위</li>
              <li>외설 또는 폭력적인 메시지·화상·음성, 기타 공서양속에 반하는 정보를 서비스에 공개 또는 게시하는 행위</li>
            </ol>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">제7조 (서비스 이용 제한 및 계약 해지)</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>회사는 회원이 본 약관의 의무를 위반하거나 서비스의 정상적인 운영을 방해한 경우 경고, 일시정지, 영구이용정지 등으로 서비스 이용을 단계적으로 제한할 수 있습니다.</li>
              <li>회원은 언제든지 서비스 내 회원탈퇴 기능을 통해 이용계약을 해지할 수 있습니다.</li>
            </ol>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">제8조 (책임의 제한)</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>회사는 천재지변 또는 이에 준하는 불가항력으로 인하여 서비스를 제공할 수 없는 경우에는 서비스 제공에 관한 책임이 면제됩니다.</li>
              <li>회사는 이용자의 귀책사유로 인한 서비스 이용의 장애에 대하여 책임을 지지 않습니다.</li>
              <li>회사는 이용자가 서비스를 이용하여 기대하는 수익을 상실한 것에 대하여 책임을 지지 않습니다.</li>
            </ol>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">제9조 (분쟁의 해결)</h2>
            <p>
              본 약관과 관련하여 회사와 이용자 간에 발생한 분쟁에 대하여는 대한민국 법을 적용하며,
              관할 법원은 민사소송법상의 관할법원으로 합니다.
            </p>
          </div>

          <div className="pt-4 border-t">
            <h2 className="text-lg font-semibold mb-2">부칙</h2>
            <p>본 약관은 {EFFECTIVE_DATE}부터 시행합니다.</p>
          </div>
        </section>
      </article>
    </main>
  );
}
