export const SERVICE_REGISTRY = [
  { value: 'common', label: '공통' },
  { value: 'info', label: '정보조회' },
  { value: 'neis', label: '학교' },
  { value: 'lostark', label: '게임' },
  { value: 'wrua', label: '일정관리' },
] as const;

export type ServiceValue = (typeof SERVICE_REGISTRY)[number]['value'];
