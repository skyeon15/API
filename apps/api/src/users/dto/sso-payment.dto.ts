import { ApiProperty } from '@nestjs/swagger';

/**
 * 연동 서비스의 고객이 **그 서비스의 판매자 계정**으로 카드를 등록할 때 쓰는 DTO.
 *
 * 🔴 카드번호는 플랫폼 등록 화면(`/payments/register`)에서만 받는다.
 *    연동 서비스가 자기 폼으로 카드번호를 받아 이 API 로 넘기면 그 서비스의 서버가
 *    카드정보 취급 범위(PCI)에 들어간다 — 중앙집중 수납을 하는 이유가 사라진다.
 */
export class RegisterClientCardDto {
  @ApiProperty({ description: '카드가 귀속될 서비스(SSO 클라이언트) ID' })
  clientId: string;

  @ApiProperty({ description: '카드번호', example: '1234567812345678' })
  cardNo: string;

  @ApiProperty({ description: '유효기간 월(MM)', example: '12' })
  expMonth: string;

  @ApiProperty({ description: '유효기간 연(YY)', example: '28' })
  expYear: string;

  @ApiProperty({ description: '카드 비밀번호 앞 2자리' })
  cardPw: string;

  @ApiProperty({
    description: '카드 소유자 인증번호(생년월일 6자리 또는 사업자번호 10자리)',
  })
  buyerAuthNo: string;
}

export class ChargeClientCardDto {
  @ApiProperty({ description: '청구하는 서비스(SSO 클라이언트) ID' })
  clientId: string;

  @ApiProperty({ description: '청구 대상 플랫폼 사용자 ID(UUID)' })
  userId: string;

  @ApiProperty({ description: '청구할 등록 카드 ID' })
  paymentMethodId: string;

  @ApiProperty({ description: '상품명', example: '에케 트래커 학생 구독' })
  goodName: string;

  @ApiProperty({ description: '금액(원)', example: 19800 })
  amount: number;

  @ApiProperty({
    description: '서비스측 주문번호. 대사는 이 값으로 한다',
    required: false,
  })
  externalOrderId?: string;

  @ApiProperty({ description: '메모', required: false })
  memo?: string;
}
