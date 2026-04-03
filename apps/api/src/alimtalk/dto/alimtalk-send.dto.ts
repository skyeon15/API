import { ApiProperty } from '@nestjs/swagger';

/**
 * 알림톡 발송 요청 DTO
 */
export class AlimtalkSendDto {
  @ApiProperty({
    description: '채널 ID',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  channelId: string;

  @ApiProperty({ description: '템플릿 코드', example: 'UC_0257' })
  templateCode: string;

  @ApiProperty({ description: '수신자 전화번호', example: '01012345678' })
  receiverPhone: string;

  @ApiProperty({
    description: '템플릿 #{변수명} 치환값',
    example: { 이름: '홍길동' },
    required: false,
  })
  variables?: Record<string, string>;

  @ApiProperty({
    description: '예약 발송 시각 (없으면 즉시 발송)',
    example: '2026-04-01T15:00:00+09:00',
    required: false,
  })
  scheduledAt?: Date;
}
