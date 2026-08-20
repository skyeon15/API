import { ApiProperty } from '@nestjs/swagger';

/**
 * 프로젝트 표준 API 응답 구조
 */
export class GeneralResponseDto<T> {
  @ApiProperty({
    description: '트랜잭션 고유 ID',
    example: 'PAT-260401-A7B8C9',
  })
  tid: string;

  @ApiProperty({ description: '상태 (success/error)', example: 'success' })
  status: 'success' | 'error';

  @ApiProperty({ description: '응답 메시지', example: '성공했습니다.' })
  message?: string;

  @ApiProperty({ description: '데이터 페이로드' })
  data: T;
}

/**
 * 발송 결과 데이터 DTO
 */
export class SendResultDataDto {
  @ApiProperty({
    description:
      '메시지 ID (발송은 성공했으나 기록 저장이 지연·실패한 경우 null)',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    nullable: true,
  })
  messageId: string | null;

  @ApiProperty({ description: '수신자 전화번호', example: '01012345678' })
  receiverPhone: string;

  @ApiProperty({ description: '최종 본문', example: '홍길동님, 예약 완료!' })
  content: string;

  @ApiProperty({ description: '발송 방식', example: '즉시' })
  type: string;

  @ApiProperty({
    description: '예약된 시각',
    example: '2026-04-01T15:00:00.000Z',
    required: false,
  })
  scheduledAt?: Date | null;

  @ApiProperty({
    description: '발송 시각',
    example: '2026-04-01T06:28:11.000Z',
    required: false,
  })
  sentAt?: Date | null;

  @ApiProperty({
    description:
      '직전 동일 요청과 중복이라 실제 발송을 생략했는지 여부 (중복 차단 창 안에서만 true)',
    example: false,
    required: false,
  })
  duplicated?: boolean;
}

/**
 * 발송 상세 결과 데이터 DTO
 */
export class ResultCheckDataDto {
  @ApiProperty({ description: '결과 코드 (1: 성공)', example: '1' })
  resultCode: string | null;

  @ApiProperty({ description: '결과 메시지', example: '성공' })
  resultMessage: string | null;

  @ApiProperty({
    description: '결과 확인 시각',
    example: '2026-04-02T10:00:00.000Z',
  })
  checkedAt: Date | null;

  @ApiProperty({ description: '수신자 전화번호', example: '01012345678' })
  receiverPhone: string;

  @ApiProperty({
    description: '발송 시각',
    example: '2026-04-01T06:28:11.000Z',
  })
  sentAt: Date | null;

  @ApiProperty({
    description: '예약 시각',
    example: '2026-04-01T06:30:00.000Z',
    required: false,
  })
  scheduledAt: Date | null;
}
