export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure:
    process.env.API_NODE_ENV === 'production' ||
    process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export function setSessionCookies(
  res: any,
  session: { accessToken: string; refreshToken: string; temporary?: boolean },
) {
  res.cookie('access_token', session.accessToken, {
    ...COOKIE_OPTIONS,
    ...(!session.temporary && { maxAge: 15 * 60 * 1000 }),
  });
  res.cookie('refresh_token', session.refreshToken, {
    ...COOKIE_OPTIONS,
    ...(!session.temporary && { maxAge: 30 * 24 * 60 * 60 * 1000 }),
  });
}
