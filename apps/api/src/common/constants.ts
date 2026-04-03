export const CONFIG = {
  API_PORT: process.env.API_PORT || 10151,
  // 백엔드 주소 (인가 코드 리다이렉트용)
  API_URL: process.env.API_URL || 'https://gaon.bbforest.net',
  // 웹 서비스 주소 (로그인 완료 후 리다이렉트용)
  WEB_URL: process.env.API_WEB_URL || 'https://platform.bbforest.net',

  // 소셜 로그인 관련
  KAKAO: {
    CLIENT_ID: process.env.API_KAKAO_CLIENT_ID,
    CLIENT_SECRET: process.env.API_KAKAO_CLIENT_SECRET,
  },
  NAVER: {
    CLIENT_ID: process.env.API_NAVER_CLIENT_ID,
    CLIENT_SECRET: process.env.API_NAVER_CLIENT_SECRET,
  },
  GOOGLE: {
    CLIENT_ID: process.env.API_GOOGLE_CLIENT_ID,
    CLIENT_SECRET: process.env.API_GOOGLE_CLIENT_SECRET,
  },
};
