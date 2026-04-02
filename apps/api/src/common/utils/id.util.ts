/**
 * 고유한 트랜잭션 ID(TID)를 생성합니다.
 * 형식: {prefix}-{YYMMDD}-{Random6}
 * 예: PAT-260401-A7B8C9
 *
 * @param prefix 서비스별 접두어 (예: 'PAT')
 * @returns 생성된 TID 문자열
 */
export function generateTid(prefix: string): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const datePart = `${yy}${mm}${dd}`;

  // 6자리 랜덤 영문 대문자 및 숫자 혼합
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomPart = '';
  for (let i = 0; i < 6; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return `${prefix}-${datePart}-${randomPart}`;
}
