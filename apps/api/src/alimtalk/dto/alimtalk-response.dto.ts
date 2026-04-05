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
    description: '메시지 ID',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  messageId: string;

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
