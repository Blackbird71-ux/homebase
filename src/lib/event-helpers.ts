export function validateEventDates(
  start: string,
  end: string,
  isAllDay = false
): { valid: boolean; error?: string } {
  const s = new Date(start)
  const e = new Date(end)

  if (isNaN(s.getTime()) || isNaN(e.getTime())) {
    return { valid: false, error: 'Invalid date format' }
  }

  if (!isAllDay && e < s) {
    return { valid: false, error: 'End time must be after start time' }
  }

  return { valid: true }
}
