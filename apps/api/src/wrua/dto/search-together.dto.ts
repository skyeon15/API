import { ApiProperty } from '@nestjs/swagger';

/**
 * 함께한 일정 검색 DTO (POST /wrua/together)
 */
export class SearchTogetherDto {
  @ApiProperty({ description: '함께한 사람의 이름', example: '광현' })
  withName: string;
}
