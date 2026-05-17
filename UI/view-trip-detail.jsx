// Trip detail view — day rail + timeline of activities, plus the editing drawer.
// Exposes: HBTripDetail

const { useState: useStateD, useMemo: useMemoD, useRef: useR } = React
const tdIcons = window.Icons

const TABS = [
  { id: 'overview',  label: 'Overview',  icon: 'layout' },
  { id: 'itinerary', label: 'Itinerary', icon: 'calendar' },
  { id: 'packing',   label: 'Packing',   icon: 'package' },
  { id: 'weather',   label: 'Weather',   icon: 'cloud' },
  { id: 'budget',    label: 'Budget',    icon: 'wallet' },
  { id: 'maps',      label: 'Maps',      icon: 'map' },
]

// ── Activity row ──────────────────────────────────────────────
function ActivityRow({ activity, onEdit, onDelete, onTagsChanged, tags, sortableProps, handleProps }) {
  const [showTags, setShowTags] = useStateD(false)
  const selectedIds = useMemoD(() => new Set((activity.tags || []).map(t => t.id || t)), [activity.tags])
  const activityTags = useMemoD(() =>
    (activity.tags || []).map(t => typeof t === 'string' ? tags.find(x => x.id === t) : t).filter(Boolean),
    [activity.tags, tags])

  return React.createElement('div', {
      ...(sortableProps || {}),
      className: `hb-activity ${(sortableProps && sortableProps.className) || ''}`,
      onClick: onEdit, role: 'button', tabIndex: 0,
    },
    handleProps && React.createElement('span', {
      ...handleProps,
      className: 'hb-activity__handle',
      title: 'Drag to reorder',
      onClick: e => e.stopPropagation(),
    },
      React.createElement('svg', { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'currentColor' },
        React.createElement('circle', { cx: 3, cy: 3, r: 1 }),
        React.createElement('circle', { cx: 9, cy: 3, r: 1 }),
        React.createElement('circle', { cx: 3, cy: 6, r: 1 }),
        React.createElement('circle', { cx: 9, cy: 6, r: 1 }),
        React.createElement('circle', { cx: 3, cy: 9, r: 1 }),
        React.createElement('circle', { cx: 9, cy: 9, r: 1 }),
      ),
    ),
    React.createElement('div', { className: 'hb-activity__time' },
      activity.startTime
        ? React.createElement(React.Fragment, null,
            React.createElement('span', { className: 'hb-activity__time-start' }, hbFmtTime(activity.startTime)),
            activity.endTime && React.createElement('span', { className: 'hb-activity__time-end' },
              `→ ${hbFmtTime(activity.endTime)}`),
          )
        : React.createElement('span', { className: 'hb-activity__time--empty' }, 'anytime'),
    ),
    React.createElement('div', { className: 'hb-activity__main' },
      React.createElement('div', { className: 'hb-activity__top' },
        React.createElement(HBCategoryBadge, { category: activity.category, size: 28 }),
        React.createElement('h4', { className: 'hb-activity__title' }, activity.title),
      ),
      activity.location && React.createElement('div', { className: 'hb-activity__location' },
        React.createElement(tdIcons.mapPin, { size: 12 }),
        React.createElement('span', null, activity.location),
      ),
      React.createElement('div', { className: 'hb-activity__tags', onClick: e => e.stopPropagation() },
        activityTags.map(t => React.createElement(HBTagChip,
          { key: t.id, tag: t, variant: 'filled' })),
        React.createElement('div', { style: { position: 'relative' } },
          React.createElement('button', {
            className: 'hb-chip hb-chip--ghost',
            type: 'button',
            onClick: (e) => { e.stopPropagation(); setShowTags(v => !v) },
          },
            React.createElement(tdIcons.tag, { size: 10 }),
            React.createElement(tdIcons.plus, { size: 9 }),
          ),
          showTags && React.createElement(HBTagPicker, {
            tags,
            selectedIds,
            onToggle: (tagId) => {
              const set = new Set(selectedIds)
              if (set.has(tagId)) set.delete(tagId)
              else set.add(tagId)
              onTagsChanged([...set])
            },
            onClose: () => setShowTags(false),
          }),
        ),
      ),
    ),
    React.createElement('div', { className: 'hb-activity__quick', onClick: e => e.stopPropagation() },
      React.createElement('button', { onClick: onEdit, title: 'Edit' },
        React.createElement(tdIcons.edit, { size: 14 })),
      React.createElement('button', { className: 'hb-quick--danger', onClick: onDelete, title: 'Delete' },
        React.createElement(tdIcons.trash, { size: 14 })),
    ),
  )
}

// ── Day rail ──────────────────────────────────────────────────
function DayRail({ days, activeDayId, onSelect, onReorder, onAddDay }) {
  const sortable = useSortable(days, onReorder, { id: 'day-rail', handleOnly: true })
  return React.createElement('div', { className: 'hb-day-rail' },
    React.createElement('div', { className: 'hb-day-rail__head' },
      React.createElement('span', null, `Days · ${days.length}`),
      React.createElement('button',
        { className: 'hb-btn hb-btn--ghost hb-btn--sm', onClick: onAddDay, style: { padding: '0 6px' } },
        React.createElement(tdIcons.plus, { size: 12 }),
      ),
    ),
    days.map((day, i) => {
      const dateObj = new Date(day.date)
      const itemProps = sortable.itemProps(i)
      const handleProps = sortable.handleProps(i)
      return React.createElement('div', {
        key: day.id,
        ...itemProps,
        className: `hb-day-chip ${itemProps.className || ''}`,
        'aria-selected': day.id === activeDayId,
        onClick: () => onSelect(day.id),
        role: 'button',
        tabIndex: 0,
      },
        React.createElement('span', {
          ...handleProps,
          className: 'hb-day-chip__handle',
          title: 'Drag to reorder',
          onClick: e => e.stopPropagation(),
        },
          React.createElement('svg', { width: 10, height: 14, viewBox: '0 0 10 14', fill: 'currentColor' },
            React.createElement('circle', { cx: 3, cy: 3, r: 1 }),
            React.createElement('circle', { cx: 7, cy: 3, r: 1 }),
            React.createElement('circle', { cx: 3, cy: 7, r: 1 }),
            React.createElement('circle', { cx: 7, cy: 7, r: 1 }),
            React.createElement('circle', { cx: 3, cy: 11, r: 1 }),
            React.createElement('circle', { cx: 7, cy: 11, r: 1 }),
          ),
        ),
        React.createElement('div', { className: 'hb-day-chip__date' },
          React.createElement('span', { className: 'hb-day-chip__day-num' }, dateObj.getDate()),
          React.createElement('span', { className: 'hb-day-chip__month' },
            dateObj.toLocaleDateString('en-AU', { month: 'short' })),
        ),
        React.createElement('div', { className: 'hb-day-chip__body' },
          React.createElement('p', { className: 'hb-day-chip__label' },
            day.label || hbFmt(day.date, { weekday: 'long' })),
          React.createElement('p', { className: 'hb-day-chip__count' },
            day.activities.length === 0
              ? 'No activities'
              : `${day.activities.length} ${day.activities.length === 1 ? 'item' : 'items'}`),
        ),
      )
    }),
  )
}

// ── Activity edit drawer ──────────────────────────────────────
function ActivityDrawer({ activity, dayDate, tags, onSave, onClose, onDelete, onOpenTags }) {
  const [title, setTitle] = useStateD(activity.title || '')
  const [location, setLocation] = useStateD(activity.location || '')
  const [category, setCategory] = useStateD(activity.category || null)
  const [startTime, setStartTime] = useStateD(hbFmtTime(activity.startTime) || '')
  const [endTime, setEndTime] = useStateD(hbFmtTime(activity.endTime) || '')
  const [notes, setNotes] = useStateD(typeof activity.notes === 'string' ? activity.notes.replace(/<[^>]+>/g, '') : '')
  const [activityTagIds, setActivityTagIds] = useStateD(
    new Set((activity.tags || []).map(t => t.id || t))
  )

  function toggleTag(tagId) {
    const next = new Set(activityTagIds)
    if (next.has(tagId)) next.delete(tagId)
    else next.add(tagId)
    setActivityTagIds(next)
  }

  function buildIso(timeStr) {
    if (!timeStr) return null
    const [h, m] = timeStr.split(':').map(Number)
    const base = new Date(`${dayDate}T00:00:00`)
    base.setHours(h || 0, m || 0, 0, 0)
    return base.toISOString()
  }

  function handleSave() {
    onSave({
      title: title.trim(),
      location: location.trim() || null,
      startTime: buildIso(startTime),
      endTime: buildIso(endTime),
      notes: notes.trim() || null,
      category,
      tags: [...activityTagIds],
    })
  }

  return React.createElement(React.Fragment, null,
    React.createElement('div', { className: 'hb-drawer-backdrop', onClick: onClose }),
    React.createElement('aside', { className: 'hb-drawer', role: 'dialog', 'aria-label': 'Edit activity' },
      React.createElement('header', { className: 'hb-drawer__head' },
        React.createElement('div', null,
          React.createElement('div', { className: 'hb-drawer__eyebrow' }, 'Activity'),
          React.createElement('div', { style: { fontSize: 12, color: 'var(--muted-foreground)', marginTop: 2 } },
            hbFmtLong(dayDate)),
        ),
        React.createElement('button', { className: 'hb-drawer__close', onClick: onClose, 'aria-label': 'Close' },
          React.createElement(tdIcons.x, { size: 16 })),
      ),
      React.createElement('div', { className: 'hb-drawer__body' },
        // Title — big, editorial
        React.createElement('div', null,
          React.createElement('input', {
            className: 'hb-input hb-input--title',
            value: title, onChange: e => setTitle(e.target.value),
            placeholder: 'What are you doing?',
            autoFocus: true,
          }),
        ),

        // Category tiles
        React.createElement(HBField, { label: 'Type', icon: tdIcons.sparkle },
          React.createElement(HBCategoryGrid, { value: category, onChange: setCategory }),
        ),

        // Time range
        React.createElement(HBField, { label: 'Time', icon: tdIcons.clock },
          React.createElement('div', { className: 'hb-time-range' },
            React.createElement('input', {
              className: 'hb-input', type: 'time',
              value: startTime, onChange: e => setStartTime(e.target.value),
            }),
            React.createElement('span', { className: 'hb-time-range__sep' }, '→'),
            React.createElement('input', {
              className: 'hb-input', type: 'time',
              value: endTime, onChange: e => setEndTime(e.target.value),
            }),
          ),
        ),

        // Location
        React.createElement(HBField, { label: 'Location', icon: tdIcons.mapPin },
          React.createElement('div', { className: 'hb-input-with-icon' },
            React.createElement(tdIcons.mapPin, null),
            React.createElement('input', {
              className: 'hb-input',
              placeholder: 'e.g. Senso-ji Temple, Asakusa',
              value: location,
              onChange: e => setLocation(e.target.value),
            }),
          ),
        ),

        // Tags — chip grid
        React.createElement(HBField, { label: 'Tags', icon: tdIcons.tag },
          React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
            tags.map(t => React.createElement(HBTagChip, {
              key: t.id, tag: t, size: 'lg',
              variant: activityTagIds.has(t.id) ? 'filled' : 'outline',
              onClick: () => toggleTag(t.id),
            })),
            React.createElement('button', {
              className: 'hb-chip hb-chip--ghost hb-chip--lg',
              onClick: onOpenTags, type: 'button',
            },
              React.createElement(tdIcons.settings, { size: 12 }),
              React.createElement('span', null, 'Manage'),
            ),
          ),
        ),

        // Notes
        React.createElement(HBField, { label: 'Notes', icon: tdIcons.note },
          React.createElement('textarea', {
            className: 'hb-textarea', rows: 5,
            placeholder: 'Booking refs, tips, things to remember…',
            value: notes,
            onChange: e => setNotes(e.target.value),
          }),
        ),
      ),
      React.createElement('footer', { className: 'hb-drawer__foot' },
        onDelete && React.createElement('button', {
          className: 'hb-btn hb-btn--danger', onClick: onDelete, style: { marginRight: 'auto' },
        },
          React.createElement(tdIcons.trash, { size: 14 }),
          React.createElement('span', null, 'Delete'),
        ),
        React.createElement('button', { className: 'hb-btn hb-btn--outline', onClick: onClose }, 'Cancel'),
        React.createElement('button', { className: 'hb-btn hb-btn--primary', onClick: handleSave },
          React.createElement(tdIcons.check, { size: 14 }),
          React.createElement('span', null, 'Save'),
        ),
      ),
    ),
  )
}

// ── Main detail view ──────────────────────────────────────────
window.HBTripDetail = function HBTripDetail({ trip, days: initialDays, tags, onBack, onOpenTags }) {
  const [tab, setTab] = useStateD('itinerary')
  const [days, setDays] = useStateD(initialDays)
  const [activeDayId, setActiveDayId] = useStateD(initialDays[0]?.id || null)
  const [editing, setEditing] = useStateD(null)   // { dayId, activity } or null
  const [showMap, setShowMap] = useStateD(false)

  const activeDay = days.find(d => d.id === activeDayId) || days[0]
  const tagMap = useMemoD(() => new Map(tags.map(t => [t.id, t])), [tags])

  // Sortable for activities in the active day
  function setActivities(newActivities) {
    setDays(prev => prev.map(d => d.id === activeDay?.id ? { ...d, activities: newActivities } : d))
  }
  const sortedActivities = useMemoD(() => {
    if (!activeDay) return []
    return activeDay.activities.slice().sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
  }, [activeDay])
  const activitySort = useSortable(sortedActivities, (next) => {
    // Clear startTime ordering — manual order wins; user can re-time individually.
    setActivities(next)
  }, { id: 'activities-' + (activeDay?.id || 'none'), handleOnly: true })

  function updateActivity(dayId, activityId, patch) {
    setDays(prev => prev.map(d =>
      d.id !== dayId ? d : {
        ...d,
        activities: d.activities.map(a => a.id !== activityId ? a : { ...a, ...patch })
      }
    ))
  }

  function saveActivity(data) {
    const { dayId, activity } = editing
    const tagsList = data.tags.map(id => tagMap.get(id)).filter(Boolean)
    updateActivity(dayId, activity.id, { ...data, tags: tagsList })
    setEditing(null)
  }

  function deleteActivity() {
    const { dayId, activity } = editing
    setDays(prev => prev.map(d =>
      d.id !== dayId ? d : { ...d, activities: d.activities.filter(a => a.id !== activity.id) }
    ))
    setEditing(null)
  }

  function quickAddActivity(dayId, title) {
    const newActivity = {
      id: 'a-' + Date.now(),
      title: title.trim(),
      location: null, startTime: null, endTime: null,
      notes: null, category: null, tags: [],
    }
    setDays(prev => prev.map(d =>
      d.id !== dayId ? d : { ...d, activities: [...d.activities, newActivity] }
    ))
    // Open drawer for further editing
    setEditing({ dayId, activity: newActivity })
  }

  function toggleDayTag(dayId, tagId) {
    setDays(prev => prev.map(d => {
      if (d.id !== dayId) return d
      const ids = new Set((d.tags || []).map(t => t.id || t))
      if (ids.has(tagId)) ids.delete(tagId); else ids.add(tagId)
      return { ...d, tags: [...ids].map(id => tagMap.get(id) || id).filter(Boolean) }
    }))
  }

  return React.createElement('div', { className: 'hb-page' },
    // ── Hero
    React.createElement('div', { className: 'hb-trip-hero' },
      React.createElement('div', { className: 'hb-trip-hero__top' },
        React.createElement('button', { className: 'hb-back', onClick: onBack, 'aria-label': 'Back to trips' },
          React.createElement(tdIcons.arrowLeft, { size: 18 })),
        React.createElement('div', { className: 'hb-trip-hero__title-block' },
          React.createElement('h1', { className: 'hb-trip-hero__title' },
            trip.icon ? React.createElement('span', { style: { marginRight: 8 } }, trip.icon) : null,
            trip.title,
          ),
          React.createElement('div', { className: 'hb-trip-hero__meta' },
            React.createElement(HBStatusPill, { trip }),
            React.createElement('span', null,
              React.createElement(tdIcons.mapPin, null), trip.destination),
            React.createElement('span', null,
              React.createElement(tdIcons.calendar, null), hbFmtRange(trip.startDate, trip.endDate)),
            React.createElement('span', null,
              React.createElement(tdIcons.clock, null),
              `${hbCountDays(trip.startDate, trip.endDate)} days`),
          ),
        ),
        React.createElement('div', { className: 'hb-trip-hero__actions' },
          React.createElement('button', { className: 'hb-btn hb-btn--outline hb-btn--sm' },
            React.createElement(tdIcons.edit, { size: 13 }),
            React.createElement('span', null, 'Edit'),
          ),
          React.createElement('button', { className: 'hb-btn hb-btn--ghost hb-btn--icon hb-btn--sm', 'aria-label': 'More' },
            React.createElement(tdIcons.more, { size: 14 }),
          ),
        ),
      ),
      // Segmented tab control
      React.createElement('div', { className: 'hb-segmented', role: 'tablist' },
        TABS.map(t => {
          const IconC = tdIcons[t.icon] || tdIcons.sparkle
          return React.createElement('button', {
            key: t.id,
            role: 'tab',
            className: 'hb-segmented__item',
            'aria-selected': tab === t.id,
            onClick: () => setTab(t.id),
          },
            React.createElement(IconC, { size: 13 }),
            React.createElement('span', null, t.label),
          )
        }),
      ),
    ),

    // ── Body
    tab === 'itinerary'
      ? React.createElement('div', { className: `hb-itinerary ${showMap ? 'hb-itinerary--with-map' : ''}` },
          React.createElement(DayRail, {
            days,
            activeDayId,
            onSelect: setActiveDayId,
            onReorder: setDays,
            onAddDay: () => {},
          }),
          React.createElement('div', { className: 'hb-timeline' },
            activeDay && React.createElement(React.Fragment, null,
              React.createElement('div', { className: 'hb-timeline__day-head' },
                React.createElement('div', null,
                  React.createElement('h3', { className: 'hb-timeline__day-title' },
                    activeDay.label || hbFmt(activeDay.date, { weekday: 'long' })),
                  React.createElement('p', { className: 'hb-timeline__day-date' },
                    hbFmtLong(activeDay.date)),
                ),
                React.createElement('div', { style: { display: 'flex', gap: 6 } },
                  React.createElement('button', {
                    className: `hb-btn ${showMap ? 'hb-btn--primary' : 'hb-btn--outline'} hb-btn--sm`,
                    onClick: () => setShowMap(v => !v),
                  },
                    React.createElement(tdIcons.map, { size: 12 }),
                    React.createElement('span', null, showMap ? 'Hide map' : 'Map'),
                  ),
                  React.createElement('button', { className: 'hb-btn hb-btn--ghost hb-btn--sm' },
                    React.createElement(tdIcons.edit, { size: 12 }),
                    React.createElement('span', null, 'Rename'),
                  ),
                ),
              ),
              // Day tags row
              React.createElement('div', { className: 'hb-tag-row' },
                React.createElement('span',
                  { style: { fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 4, fontWeight: 600 } },
                  'Tags',
                ),
                tags.map(t => {
                  const active = (activeDay.tags || []).some(x => (x.id || x) === t.id)
                  return React.createElement(HBTagChip, {
                    key: t.id, tag: t,
                    variant: active ? 'filled' : 'outline',
                    onClick: () => toggleDayTag(activeDay.id, t.id),
                  })
                }),
              ),
              // Activities
              sortedActivities.length === 0
                ? React.createElement('div', { className: 'hb-empty', style: { padding: '32px 16px' } },
                    React.createElement('p', { className: 'hb-empty__title' }, 'No activities yet'),
                    React.createElement('p', { className: 'hb-empty__hint' }, 'Type below to add one.'),
                  )
                : sortedActivities.map((a, i) => React.createElement(ActivityRow, {
                    key: a.id, activity: a, tags,
                    sortableProps: activitySort.itemProps(i),
                    handleProps: activitySort.handleProps(i),
                    onEdit: () => setEditing({ dayId: activeDay.id, activity: a }),
                    onDelete: () => {
                      setDays(prev => prev.map(d =>
                        d.id !== activeDay.id ? d :
                        { ...d, activities: d.activities.filter(x => x.id !== a.id) }
                      ))
                    },
                    onTagsChanged: (ids) => {
                      const tagsList = ids.map(id => tagMap.get(id)).filter(Boolean)
                      updateActivity(activeDay.id, a.id, { tags: tagsList })
                    },
                  })),
              // Quick-add
              React.createElement(QuickAddRow, { onAdd: (title) => quickAddActivity(activeDay.id, title) }),
            ),
          ),
          // Map pane
          showMap && activeDay && React.createElement(TripMap, {
            key: activeDay.id,
            activities: sortedActivities,
            onPinClick: (a) => setEditing({ dayId: activeDay.id, activity: a }),
          }),
        )
      : React.createElement('div', { className: 'hb-page__body' },
          React.createElement('div', { className: 'hb-empty' },
            React.createElement('div', { className: 'hb-empty__icon' },
              React.createElement(tdIcons[TABS.find(t => t.id === tab)?.icon || 'sparkle'], { size: 22 })),
            React.createElement('p', { className: 'hb-empty__title' },
              `${TABS.find(t => t.id === tab)?.label} view`),
            React.createElement('p', { className: 'hb-empty__hint' },
              'Existing Homebase view — drops in unchanged. This redesign focuses on Trips index + Itinerary editing.'),
          ),
        ),

    // Drawer
    editing && React.createElement(ActivityDrawer, {
      activity: editing.activity,
      dayDate: days.find(d => d.id === editing.dayId)?.date || trip.startDate,
      tags,
      onSave: saveActivity,
      onDelete: deleteActivity,
      onClose: () => setEditing(null),
      onOpenTags,
    }),
  )
}

function QuickAddRow({ onAdd }) {
  const [val, setVal] = useStateD('')
  function submit(e) {
    e.preventDefault()
    if (!val.trim()) return
    onAdd(val)
    setVal('')
  }
  return React.createElement('form', { className: 'hb-quickadd', onSubmit: submit },
    React.createElement('div', { className: 'hb-quickadd__icon' },
      React.createElement(tdIcons.plus, { size: 16 })),
    React.createElement('input', {
      value: val,
      onChange: e => setVal(e.target.value),
      placeholder: 'Add an activity — press Enter to open details…',
    }),
    React.createElement('button', {
      type: 'submit',
      className: 'hb-btn hb-btn--ghost hb-btn--sm',
      disabled: !val.trim(),
    },
      React.createElement('span', null, 'Add'),
      React.createElement(tdIcons.chevronRight, { size: 12 }),
    ),
  )
}

// ── Map pane (Leaflet) ────────────────────────────────────────
// Renders pins for every activity that has lat/lng. Click pin -> onPinClick(activity).
function TripMap({ activities, onPinClick }) {
  const containerRef = useR(null)
  const mapRef = useR(null)
  const markersRef = useR([])
  const pinned = activities.filter(a => typeof a.lat === 'number' && typeof a.lng === 'number')

  React.useEffect(() => {
    if (!containerRef.current || !window.L) return
    // Init once
    if (!mapRef.current) {
      const L = window.L
      mapRef.current = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: false,
      })
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(mapRef.current)
    }
    const L = window.L
    const map = mapRef.current

    // Clear existing markers
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    if (pinned.length === 0) {
      map.setView([0, 0], 2)
      return
    }

    // Custom numbered pin
    pinned.forEach((a, i) => {
      const cat = categoryMeta(a.category)
      const colorVar = cat ? cat.cssClass : 'hb-cat-default'
      const html = `
        <div class="hb-map-pin ${colorVar}">
          <span class="hb-map-pin__num">${i + 1}</span>
        </div>`
      const icon = L.divIcon({
        html, className: 'hb-map-pin-wrap',
        iconSize: [32, 40], iconAnchor: [16, 38],
      })
      const m = L.marker([a.lat, a.lng], { icon })
        .addTo(map)
        .on('click', () => onPinClick(a))
      const time = a.startTime ? hbFmtTime(a.startTime) : 'anytime'
      m.bindTooltip(`<strong>${a.title}</strong><br/><span style="opacity:0.7">${time}</span>`, {
        direction: 'top', offset: [0, -36], opacity: 0.95,
      })
      markersRef.current.push(m)
    })

    // Draw a connecting line
    if (pinned.length > 1) {
      const line = L.polyline(pinned.map(a => [a.lat, a.lng]), {
        color: 'currentColor',
        weight: 2,
        opacity: 0.35,
        dashArray: '4 6',
      }).addTo(mapRef.current)
      markersRef.current.push(line)
    }

    // Fit bounds with padding
    const bounds = L.latLngBounds(pinned.map(a => [a.lat, a.lng]))
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
  }, [activities, onPinClick])

  // Resize map when container size changes (e.g. drawer opens)
  React.useEffect(() => {
    const ro = new ResizeObserver(() => { mapRef.current?.invalidateSize() })
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  return React.createElement('div', { className: 'hb-map-pane' },
    React.createElement('div', { ref: containerRef, className: 'hb-map-pane__canvas' }),
    pinned.length === 0 && React.createElement('div', { className: 'hb-map-pane__empty' },
      React.createElement(tdIcons.mapPin, { size: 24 }),
      React.createElement('p', null, 'No locations'),
      React.createElement('p', { style: { fontSize: 12, opacity: 0.7 } },
        'Add lat/lng to activities to plot them.'),
    ),
  )
}
