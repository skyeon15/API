import { ApiProperty } from '@nestjs/swagger';

/**
 * 연동 서비스가 **자기 손님**의 결제를 다룰 때 쓰는 DTO 모음.
 *
 * `externalUserId` 는 그 서비스가 부르는 자기 사용자 id 다. 플랫폼은 뜻을 모르고
 * 그대로 되돌려 준다 — 그래서 **서비스마다 따로 논다**(같은 문자열이라도 남남).
 */
export class EnsureServiceCustomerDto {
  @ApiProperty({ description: '서비스측 사용자 ID', example: 'karaoke-user-1024' })
  externalUserId: string;

  @ApiProperty({ description: '표시용 이름(영수증·대시보드)', required: false })
  label?: string;

  @ApiProperty({ description: '영수증 받을 이메일', required: false })
  email?: string;

  @ApiProperty({ description: '실명(카드 명의와 다를 수 있음)', required: false })
  name?: string;
}

export class RegisterServiceCardDto {
  @ApiProperty({ description: '서비스측 사용자 ID' })
  externalUserId: string;

  @ApiProperty({ description: '확정된 SetupIntent ID' })
  setupIntentId: string;
}

export class CreateServicePaymentIntentDto {
  @ApiProperty({ description: '결제 금액(최소 화폐 단위)', example: 1000 })
  amount: number;

  @ApiProperty({ description: '통화 코드', example: 'usd', required: false })
  currency?: string;

  @ApiProperty({ description: '상품명', example: '에케 노래책 후원' })
  goodName: string;

  @ApiProperty({
    description:
      '서비스측 사용자 ID. 주면 그 사람의 Customer 에 붙고, 안 주면 익명 결제다',
    required: false,
  })
  externalUserId?: string;

  @ApiProperty({
    description: '결제 후 카드 저장 여부. 켜려면 externalUserId 가 필수다',
    required: false,
    default: false,
  })
  savePaymentMethod?: boolean;

  @ApiProperty({
    description: '서비스측 주문번호(대사용)',
    required: false,
    example: 'donate-20260917-A1B2',
  })
  externalOrderId?: string;

  @ApiProperty({ description: '표시용 이름', required: false })
  label?: string;

  @ApiProperty({ description: '영수증 받을 이메일', required: false })
  email?: string;

  @ApiProperty({
    description:
      '카드 명세서 꼬리표. 계정 프리픽스 뒤에 `* ` 로 이어 붙는다(라틴 문자, 남는 자리만큼만). 카드 결제에만 붙는다',
    required: false,
    example: 'EKE DONATE',
  })
  statementDescriptorSuffix?: string;
}

export class ChargeServiceCardDto {
  @ApiProperty({ description: '서비스측 사용자 ID' })
  externalUserId: string;

  @ApiProperty({ description: '청구할 저장 카드 ID(플랫폼 payment_methods.id)' })
  paymentMethodId: string;

  @ApiProperty({ description: '결제 금액(최소 화폐 단위)', example: 500 })
  amount: number;

  @ApiProperty({ description: '통화 코드', example: 'usd', required: false })
  currency?: string;

  @ApiProperty({ description: '상품명', example: '에케 노래책 정기 후원' })
  goodName: string;

  @ApiProperty({ description: '서비스측 주문번호(대사용)', required: false })
  externalOrderId?: string;

  @ApiProperty({ description: '메모', required: false })
  memo?: string;

  @ApiProperty({ description: '영수증 받을 이메일', required: false })
  email?: string;

  @ApiProperty({
    description: '카드 명세서 꼬리표(일회성 결제와 같은 규칙)',
    required: false,
    example: 'EKE DONATE',
  })
  statementDescriptorSuffix?: string;
}

export class UpsertServiceWebhookDto {
  @ApiProperty({
    description: '결제 결과를 받을 주소(HTTPS)',
    example: 'https://karaoke.bbforest.net/api/support/platform-webhook',
  })
  url: string;

  @ApiProperty({
    description:
      '받을 이벤트. **비우면 전부** 받는다: payment.paid · payment.failed · payment.refunded · payment.disputed · payment.dispute_closed',
    required: false,
    type: [String],
  })
  events?: string[];

  @ApiProperty({ description: '사용 여부', required: false, default: true })
  isActive?: boolean;
}
