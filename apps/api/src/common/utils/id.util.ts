import { randomInt } from 'crypto';

/**
 * 고유한 트랜잭션 ID(TID)를 생성합니다.
 * 형식: {prefix}-YYMMDD-NNNNNN
 * 예: PDS-TAK-260619-374821
 *
 * @param prefix 서비스별 접두어 (예: 'PDS-TAK')
 * @returns 생성된 TID 문자열
 */
export function generateTid(prefix: string): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const datePart = `${yy}${mm}${dd}`;

  // 6자리 숫자 (000000~999999)
  const numberPart = String(randomInt(0, 1_000_000)).padStart(6, '0');

  return `${prefix}-${datePart}-${numberPart}`;
}

/**
 * 결제 주문 ID를 생성합니다.
 * 형식: PDS-PAY-YYMMDD-NNNNNN
 * 예: PDS-PAY-260619-374821
 *
 * @param prefix 서비스별 접두어 (기본값 'PDS-PAY')
 * @returns 생성된 주문 ID 문자열
 */
export function generateOrderId(prefix = 'PDS-PAY'): string {
  return generateTid(prefix);
}
