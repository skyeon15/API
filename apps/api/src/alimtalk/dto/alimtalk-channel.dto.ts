import { ApiProperty } from '@nestjs/swagger';

/**
 * 채널 인증 요청 DTO (POST /alimtalk/channels/auth)
 */
export class RequestChannelAuthDto {
  @ApiProperty({ description: '카카오 채널 검색용 ID', example: '@bbforest' })
  plusId: string;

  @ApiProperty({
    description: '인증번호를 받을 전화번호',
    example: '01012345678',
  })
  phone: string;
}

/**
 * 채널 등록 DTO (POST /alimtalk/channels)
 */
export class AddChannelDto {
  @ApiProperty({ description: '카카오 채널 검색용 ID', example: '@bbforest' })
  plusId: string;

  @ApiProperty({
    description: '인증 요청으로 전송받은 인증번호',
    example: '123456',
  })
  authNum: string;

  @ApiProperty({ description: '인증에 사용한 전화번호', example: '01012345678' })
  phone: string;

  @ApiProperty({
    description: '카카오 비즈니스 카테고리 코드 (카테고리 목록 조회 참고)',
  })
  categoryCode: string;

  @ApiProperty({ description: '채널 별칭', example: '파란대나무숲' })
  name: string;
}
