// 가입 완료(최초 로그인 시 필수정보 입력) 판정 로직.
// 필수: 이름·닉네임·성별·생년월일·전화번호·이메일.
// 주소는 선택이다 — 배송이 필요한 서비스가 그 시점에 받는다.
// 닉네임은 비워 두면 서버가 이름으로 채운다(auth.service.ts updateProfile).

export const REQUIRED_PROFILE_FIELDS = [
  'name',
  'nickname',
  'gender',
  'birthDate',
  'phone',
  'email',
] as const;

type ProfileFields = Partial<
  Record<(typeof REQUIRED_PROFILE_FIELDS)[number], unknown>
>;

/** 필수 프로필 정보가 모두 채워졌는지(=가입 완료) 여부 */
export function isProfileComplete(
  user: ProfileFields | null | undefined,
): boolean {
  if (!user) return false;
  return REQUIRED_PROFILE_FIELDS.every((field) => {
    const value = user[field];
    return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
  });
}
