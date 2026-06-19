import { ApiProperty } from '@nestjs/swagger';
import { CashReceiptType } from '../entities/cash-receipt.entity.js';

// (요청 DTO는 아래, 응답 DTO는 파일 하단 Responses 섹션)

// ── Seller Management ──────────────────────────────────────────────────────

export class RegisterSellerDto {
  @ApiProperty({ description: '판매자 아이디', example: 'myshop01' })
  sellerId: string;

  @ApiProperty({ description: '판매자 비밀번호' })
  sellerPwd: string;

  @ApiProperty({ description: '판매자(상호)명', example: '내 가게' })
  sellerName: string;

  @ApiProperty({ description: '이메일', example: 'shop@example.com' })
  email: string;

  @ApiProperty({ description: '연락처', example: '01012345678' })
  phone: string;

  @ApiProperty({
    description: '가입 유형 (1: 개인, 2: 사업자)',
    enum: ['1', '2'],
    example: '1',
  })
  usertype: '1' | '2';

  @ApiProperty({ description: '업종', example: '소매업' })
  bizkind: string;

  @ApiProperty({ description: '메모', required: false })
  memo?: string;

  @ApiProperty({
    description: '사업자등록번호 (사업자=usertype 2일 때 필수)',
    required: false,
    example: '1234567890',
  })
  compregno?: string;

  @ApiProperty({
    description: '상호명 (사업자일 때 필수)',
    required: false,
  })
  compname?: string;

  @ApiProperty({ description: '업태 (사업자일 때 필수)', required: false })
  biztype1?: string;

  @ApiProperty({ description: '종목 (사업자일 때 필수)', required: false })
  biztype2?: string;

  @ApiProperty({ description: '대표자명 (사업자일 때 필수)', required: false })
  ceo_nm?: string;

  @ApiProperty({
    description: '정산은행명 (선택)',
    required: false,
    example: '국민은행',
  })
  bankName?: string;

  @ApiProperty({
    description: '정산은행 계좌번호 (선택, 숫자만)',
    required: false,
    example: '12345678901234',
  })
  bankAccountNo?: string;

  @ApiProperty({
    description: '정산은행 예금주 (선택)',
    required: false,
    example: '홍길동',
  })
  bankHolder?: string;
}

export class CheckSellerIdDto {
  @ApiProperty({ description: '중복 확인할 판매자 아이디', example: 'myshop01' })
  sellerId: string;
}

export class UpdateSellerDto {
  @ApiProperty({ description: '메모', required: false })
  memo?: string;
}

// ── Payment Method ─────────────────────────────────────────────────────────

export class RegisterPaymentDto {
  @ApiProperty({ description: '결제를 처리할 판매자 계정 ID' })
  sellerId: string;

  @ApiProperty({ description: '카드번호', example: '1234567812345678' })
  cardNo: string;

  @ApiProperty({ description: '유효기간 월(MM)', example: '12' })
  expMonth: string;

  @ApiProperty({ description: '유효기간 연(YY)', example: '28' })
  expYear: string;

  @ApiProperty({ description: '카드 비밀번호 앞 2자리' })
  cardPw: string;

  @ApiProperty({
    description: '카드 소유자 인증번호(생년월일 6자리 또는 사업자번호)',
  })
  buyerAuthNo: string;

  @ApiProperty({ description: '메모', required: false })
  memo?: string;
}

export class UpdatePaymentDto {
  @ApiProperty({ description: '카드 별칭', required: false })
  cardName?: string;

  @ApiProperty({ description: '메모', required: false })
  memo?: string;
}

export class ChargeCardDto {
  @ApiProperty({ description: '결제에 사용할 등록된 카드 ID' })
  paymentMethodId: string;

  @ApiProperty({ description: '결제를 처리할 판매자 계정 ID' })
  sellerId: string;

  @ApiProperty({ description: '상품명', example: '월 구독료' })
  goodName: string;

  @ApiProperty({ description: '결제 금액(원)', example: 10000 })
  amount: number;

  @ApiProperty({ description: '구매자명', required: false })
  buyerName?: string;

  @ApiProperty({ description: '구매자 연락처', required: false })
  buyerPhone?: string;

  @ApiProperty({ description: '메모', required: false })
  memo?: string;

  @ApiProperty({ description: '결제 결과 수신 콜백 URL', required: false })
  feedbackUrl?: string;
}

export class CancelTransactionDto {
  @ApiProperty({
    description: '취소 금액(원). 미지정 시 전체 취소',
    required: false,
  })
  amount?: number;

  @ApiProperty({ description: '취소 메모', required: false })
  memo?: string;
}

// ── Cash Receipt ───────────────────────────────────────────────────────────

export class IssueCashReceiptDto {
  @ApiProperty({ description: '판매자 계정 ID' })
  sellerId: string;

  @ApiProperty({
    description: '발급 유형',
    enum: CashReceiptType,
    example: CashReceiptType.INCOME_DEDUCTION,
  })
  type: CashReceiptType;

  @ApiProperty({ description: '구매자명' })
  buyerName: string;

  @ApiProperty({
    description: '소득공제: 휴대폰번호/현금영수증카드, 지출증빙: 사업자번호',
  })
  idInfo: string;

  @ApiProperty({ description: '상품명' })
  goodName: string;

  @ApiProperty({ description: '금액(원)', example: 10000 })
  amount: number;

  @ApiProperty({
    description: '연결할 결제 거래 ID',
    required: false,
  })
  transactionId?: string;
}

// ── Stripe (MoR) ───────────────────────────────────────────────────────────

export class RegisterStripeCardDto {
  @ApiProperty({ description: '확정된 SetupIntent ID' })
  setupIntentId: string;
}

export class CreateStripePaymentIntentDto {
  @ApiProperty({ description: '결제 금액(최소 화폐 단위)', example: 1000 })
  amount: number;

  @ApiProperty({ description: '통화 코드', required: false, example: 'usd' })
  currency?: string;

  @ApiProperty({ description: '상품명' })
  goodName: string;

  @ApiProperty({
    description: '결제 후 카드 저장 여부',
    required: false,
    default: false,
  })
  savePaymentMethod?: boolean;
}

export class ChargeStripeDto {
  @ApiProperty({ description: '저장된 Stripe 카드(PaymentMethod) ID' })
  paymentMethodId: string;

  @ApiProperty({ description: '결제 금액(최소 화폐 단위)', example: 1000 })
  amount: number;

  @ApiProperty({ description: '통화 코드', required: false, example: 'usd' })
  currency?: string;

  @ApiProperty({ description: '상품명' })
  goodName: string;

  @ApiProperty({ description: '메모', required: false })
  memo?: string;
}

export class RefundStripeDto {
  @ApiProperty({
    description: '환불 금액(최소 화폐 단위). 미지정 시 전체 환불',
    required: false,
  })
  amount?: number;

  @ApiProperty({ description: '환불 사유', required: false })
  reason?: string;
}

// ── Responses ──────────────────────────────────────────────────────────────

export class PayappSellerResponseDto {
  @ApiProperty({ description: '판매자 계정 ID(내부 UUID)' })
  id: string;

  @ApiProperty({ description: '소유 사용자 ID' })
  userId: string;

  @ApiProperty({ description: '페이앱 판매자 아이디', example: 'myshop01' })
  sellerId: string;

  @ApiProperty({
    description: 'PayApp 연동 KEY (빌링 연동용 민감값)',
  })
  linkKey: string;

  @ApiProperty({
    description: 'PayApp 연동 VALUE (빌링 연동용 민감값)',
  })
  linkVal: string;

  @ApiProperty({ description: '메모', nullable: true, required: false })
  memo: string | null;

  @ApiProperty({ description: '활성 여부' })
  isActive: boolean;

  @ApiProperty({
    description: '생성 시각',
    type: String,
    format: 'date-time',
  })
  createdAt: Date;

  @ApiProperty({
    description: '수정 시각',
    type: String,
    format: 'date-time',
  })
  updatedAt: Date;
}

export class CheckSellerIdResponseDto {
  @ApiProperty({ description: '사용 가능 여부', example: true })
  success: boolean;

  @ApiProperty({ description: '결과 메시지', example: '사용 가능한 아이디입니다.' })
  message: string;
}

export class SuccessResponseDto {
  @ApiProperty({ description: '성공 여부', example: true })
  success: boolean;
}
