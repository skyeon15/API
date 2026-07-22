import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 휴대폰 번호에 하이픈을 넣어 표시용으로 변환한다. */
export function formatPhone(val: string) {
  const s = val.replace(/\D/g, '')
  if (s.length <= 3) return s
  if (s.length <= 7) return `${s.slice(0, 3)}-${s.slice(3)}`
  return `${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7, 11)}`
}
