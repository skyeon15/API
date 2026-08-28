import { ApiProperty } from '@nestjs/swagger';

// SSO(OAuth2 authorization code) 연동용 DTO — 문서 노출 대상은 이 파일의 것만.
// 플랫폼 자체 로그인(소셜/전화 인증 등) 엔드포인트는 Swagger에서 제외한다.

// ── Requests ───────────────────────────────────────────────────────────────

export class SsoTokenRequestDto {
  @ApiProperty({
    description: '고정값 authorization_code',
    enum: ['authorization_code'],
    example: 'authorization_code',
  })
  grant_type: string;

  @ApiProperty({
    description: 'authorize 리다이렉트로 받은 인가 코드 (발급 후 5분 만료, 1회용)',
  })
  code: string;

  @ApiProperty({ description: '발급받은 클라이언트 ID' })
  client_id: string;

  @ApiProperty({
    description: '클라이언트 시크릿 — 반드시 서비스 백엔드에서만 사용',
  })
  client_secret: string;

  @ApiProperty({
    description: 'authorize 요청에 사용한 redirect_uri (불일치 시 거부)',
    example: 'https://myservice.example.com/auth/callback',
  })
  redirect_uri: string;
}

// ── Responses ──────────────────────────────────────────────────────────────

export class SsoTokenResponseDto {
  @ApiProperty({
    description:
      '사용자 액세스 토큰(JWT). userinfo 호출 시 Bearer로 사용. 주의: 응답 키가 OAuth2 표준(access_token)이 아닌 camelCase',
  })
  accessToken: string;

  @ApiProperty({ description: '리프레시 토큰' })
  refreshToken: string;

  @ApiProperty({
    description:
      'ID 토큰(JWT, HS256). scope에 따라 profile/email/phone/address 클레임 포함. 클라이언트는 서명 검증 수단이 없으므로 신원 확인은 userinfo 호출 권장',
  })
  idToken: string;
}

export class SsoUserinfoResponseDto {
  @ApiProperty({ description: '사용자 고유 ID (UUID)' })
  sub: string;

  @ApiProperty({ description: '이름', nullable: true })
  name: string;

  @ApiProperty({ description: '닉네임', nullable: true })
  nickname: string;

  @ApiProperty({ description: '이메일', nullable: true })
  email: string;

  @ApiProperty({ description: '프로필 이미지 URL', nullable: true })
  picture: string;
}

export class SsoClientInfoResponseDto {
  @ApiProperty({ description: '클라이언트 ID' })
  clientId: string;

  @ApiProperty({ description: '서비스(클라이언트) 이름' })
  clientName: string;

  @ApiProperty({ description: '로그인 화면에 표시할 로고 URL', nullable: true })
  logoUrl: string;

  @ApiProperty({ description: '브랜드 색상 (hex)', example: '#000000' })
  primaryColor: string;

  @ApiProperty({
    description: '로그인 화면 테마 설정',
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  themeConfig: Record<string, any>;

  @ApiProperty({
    description: '이 클라이언트에 허용된 scope 목록',
    type: [String],
    example: ['openid', 'profile'],
  })
  allowedScopes: string[];
}
