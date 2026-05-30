import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { DEFAULT_TIMEZONE } from "@/lib/timezone"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns today's date as a YYYY-MM-DD string in the app's default timezone
 * (DEFAULT_TIMEZONE — Australia/Sydney).
 * Use INSTEAD OF new Date().toISOString().split('T')[0] for all date form defaults.
 * The ISO string returns UTC date, which is "yesterday" in Sydney between
 * midnight and 10am AEST (11am AEDT).
 *
 * en-CA locale produces YYYY-MM-DD format natively (same as ISO date part).
 */
export function todayAU(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DEFAULT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
