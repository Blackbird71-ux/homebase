// Per-device text scale (percent of the browser's 16px root). Client-safe: no server imports.
// Overrides the account-level data-font-size preset on this device only.
export const FONT_SCALE_KEY = 'hb-font-scale'
export const FONT_SCALE_MIN = 85
export const FONT_SCALE_MAX = 160
export const FONT_SCALE_STEP = 5

/** Inline script run in <head> before paint so the scale applies without a flash. */
export const FONT_SCALE_INIT_SCRIPT = `try{var s=parseInt(localStorage.getItem('${FONT_SCALE_KEY}'),10);if(s>=${FONT_SCALE_MIN}&&s<=${FONT_SCALE_MAX}){document.documentElement.style.fontSize=s+'%';document.documentElement.style.setProperty('--hb-font-scale',s/100)}}catch(e){}`

export function getStoredFontScale(): number | null {
  try {
    const v = parseInt(localStorage.getItem(FONT_SCALE_KEY) ?? '', 10)
    return v >= FONT_SCALE_MIN && v <= FONT_SCALE_MAX ? v : null
  } catch {
    return null
  }
}

function applyScale(percent: number) {
  document.documentElement.style.fontSize = `${percent}%`
  document.documentElement.style.setProperty('--hb-font-scale', String(percent / 100))
}

/** Apply (and persist) a scale; null clears the override and falls back to the account preset. */
export function setFontScale(percent: number | null) {
  try {
    if (percent === null) {
      localStorage.removeItem(FONT_SCALE_KEY)
      document.documentElement.style.removeProperty('font-size')
      document.documentElement.style.removeProperty('--hb-font-scale')
    } else {
      localStorage.setItem(FONT_SCALE_KEY, String(percent))
      applyScale(percent)
    }
  } catch {
    if (percent !== null) applyScale(percent)
  }
}
