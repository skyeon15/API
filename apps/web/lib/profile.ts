// 가입 완료(최초 로그인 시 필수정보 입력) 판정 로직.
// 개인정보처리방침 제2조 필수항목과 일치시킨다: 이름·성별·생년월일·전화번호·이메일·주소

export const REQUIRED_PROFILE_FIELDS = [
  'name',
  'gender',
  'birthDate',
  'phone',
  'email',
  'address',
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
