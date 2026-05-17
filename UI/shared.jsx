// Shared components: Chip, TagPicker popover, CategoryTile, StatusPill, helpers
// Exposes globals: HBChip, HBTagChip, HBTagPicker, HBStatusPill, HBCategoryBadge, HBCategoryGrid
// Also: hbFmt (date helpers), categoryMeta()

const sharedIcons = window.Icons

function hbFmt(date, opts) {
  return new Date(date).toLocaleDateString('en-AU', opts || { day: 'numeric', month: 'short' })
}
function hbFmtLong(date) {
  return new Date(date).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
function hbFmtRange(s, e) {
  const a = new Date(s), b = new Date(e)
  const opts = { day: 'numeric', month: 'short', year: 'numeric' }
  if (a.toDateString() === b.toDateString()) return a.toLocaleDateString('en-AU', opts)
  return `${a.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${b.toLocaleDateString('en-AU', opts)}`
}
function hbFmtTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })
}
function hbDaysUntil(d) {
  const diff = Math.round((new Date(d) - new Date()) / 86400000)
  if (diff < 0) return `${Math.abs(diff)} d ago`
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  return `in ${diff} days`
}
function hbCountDays(s, e) {
  return Math.round((new Date(e) - new Date(s)) / 86400000) + 1
}
window.hbFmt = hbFmt
window.hbFmtLong = hbFmtLong
window.hbFmtRange = hbFmtRange
window.hbFmtTime = hbFmtTime
window.hbDaysUntil = hbDaysUntil
window.hbCountDays = hbCountDays

// Category metadata lookup
window.categoryMeta = function categoryMeta(value) {
  return (window.HB_DATA.CATEGORIES || []).find(c => c.value === value) || null
}

// ── Status pill ─────────────────────────────────────────────
window.HBStatusPill = function HBStatusPill({ trip }) {
  const now = new Date()
  const start = new Date(trip.startDate)
  const end = new Date(trip.endDate)
  let kind = 'planning', label = 'Planning'
  if (trip.status === 'cancelled') { kind = 'cancelled'; label = 'Cancelled' }
  else if (trip.status === 'completed') { kind = 'completed'; label = 'Completed' }
  else if (now >= start && now <= end) { kind = 'live'; label = 'In progress' }
  else if (now < start) { kind = 'upcoming'; label = 'Upcoming' }
  return React.createElement('span',
    { className: `hb-status hb-status--${kind}` },
    label,
  )
}

// ── Chip ────────────────────────────────────────────────────
window.HBChip = function HBChip({ children, color, variant = 'outline', size, onClick, title, ...rest }) {
  // variant: 'outline' | 'filled' | 'ghost'
  const className = ['hb-chip']
  if (variant === 'filled') className.push('hb-chip--filled')
  if (variant === 'ghost') className.push('hb-chip--ghost')
  if (size === 'lg') className.push('hb-chip--lg')

  const style = {}
  if (variant === 'filled' && color) {
    style.background = color
  } else if (variant === 'outline' && color) {
    style.borderColor = `color-mix(in srgb, ${color} 60%, transparent)`
    style.color = color
  }

  const Tag = onClick ? 'button' : 'span'
  return React.createElement(
    Tag,
    { className: className.join(' '), style, onClick, title, type: onClick ? 'button' : undefined, ...rest },
    color && variant !== 'filled'
      ? React.createElement('span', { className: 'hb-chip__dot', style: { background: color } })
      : null,
    children,
  )
}

// ── Tag chip with emoji + name ──────────────────────────────
window.HBTagChip = function HBTagChip({ tag, variant = 'filled', size, onClick, active }) {
  const v = variant === 'auto' ? (active ? 'filled' : 'outline') : variant
  return React.createElement(HBChip, { color: tag.color, variant: v, size, onClick, title: tag.name },
    tag.emoji ? React.createElement('span', null, tag.emoji) : null,
    React.createElement('span', null, tag.name),
  )
}

// ── Tag picker popover ──────────────────────────────────────
// Renders an inline-positioned popover. Caller controls anchor + open state.
window.HBTagPicker = function HBTagPicker({ tags, selectedIds, onToggle, onClose, onManage, align = 'left' }) {
  const ref = React.useRef(null)
  React.useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [onClose])

  return React.createElement('div', {
    ref,
    className: 'hb-popover',
    style: { top: 'calc(100% + 6px)', [align]: 0 },
    onClick: e => e.stopPropagation(),
  },
    React.createElement('div', { className: 'hb-popover__head' },
      React.createElement('span', null, 'Tags'),
      onManage && React.createElement('button', { type: 'button', onClick: onManage },
        React.createElement(sharedIcons.settings, { size: 12 }),
        'Manage',
      ),
    ),
    tags.length === 0
      ? React.createElement('p', { style: { fontSize: 12, color: 'var(--muted-foreground)', padding: '6px 8px', margin: 0 } },
          'No tags yet')
      : tags.map(tag => {
          const isActive = selectedIds.has(tag.id)
          return React.createElement('button', {
            key: tag.id,
            type: 'button',
            className: 'hb-popover__row',
            'aria-pressed': isActive,
            onClick: () => onToggle(tag.id),
          },
            React.createElement('span', { className: 'hb-chip__dot', style: { background: tag.color } }),
            React.createElement('span', { style: { flex: 1 } },
              tag.emoji ? React.createElement('span', { style: { marginRight: 4 } }, tag.emoji) : null,
              tag.name,
            ),
            isActive ? React.createElement(sharedIcons.check, { size: 14, style: { color: 'var(--primary)' } }) : null,
          )
        }),
  )
}

// ── Category badge (the icon tile next to an activity) ─────
window.HBCategoryBadge = function HBCategoryBadge({ category, size = 36 }) {
  const meta = categoryMeta(category)
  const IconComp = meta ? sharedIcons[meta.icon] || sharedIcons.sparkle : sharedIcons.sparkle
  return React.createElement(
    'span',
    {
      className: `hb-cat-badge ${meta ? meta.cssClass : 'hb-cat-default'}`,
      style: { width: size, height: size, borderRadius: size === 36 ? 10 : 8 },
    },
    React.createElement(IconComp, { size: size === 36 ? 18 : 14 }),
  )
}

// ── Category grid (visual picker for drawer) ────────────────
window.HBCategoryGrid = function HBCategoryGrid({ value, onChange }) {
  return React.createElement('div', { className: 'hb-cat-grid' },
    HB_DATA.CATEGORIES.map(c => {
      const IconComp = sharedIcons[c.icon] || sharedIcons.sparkle
      const active = value === c.value
      return React.createElement('button', {
        key: c.value,
        type: 'button',
        className: `hb-cat-tile ${c.cssClass}`,
        'aria-pressed': active,
        onClick: () => onChange(active ? null : c.value),
      },
        React.createElement('span', { className: 'hb-cat-tile__icon' },
          React.createElement(IconComp, { size: 16 }),
        ),
        React.createElement('span', { className: 'hb-cat-tile__label' }, c.label),
      )
    })
  )
}

// ── Field component ─────────────────────────────────────────
window.HBField = function HBField({ label, icon, children, hint }) {
  return React.createElement('div', { className: 'hb-field' },
    label && React.createElement('label', { className: 'hb-field__label' },
      icon ? React.createElement(icon, { size: 12 }) : null,
      label,
    ),
    children,
    hint && React.createElement('p', { style: { fontSize: 11, color: 'var(--muted-foreground)', margin: 0 } }, hint),
  )
}
