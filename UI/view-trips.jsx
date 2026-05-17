// Trips index view — hero cards with cover art, status, countdown, quick actions.
// Exposes: HBTripsList

const { useState } = React
const tlIcons = window.Icons

function tagsByIds(ids) {
  return (ids || []).map(id => HB_DATA.TAGS.find(t => t.id === id)).filter(Boolean)
}

function TripCard({ trip, onOpen, onDelete, dense }) {
  const start = new Date(trip.startDate), end = new Date(trip.endDate)
  const days = hbCountDays(trip.startDate, trip.endDate)
  const upcoming = new Date() < start
  const past = trip.status === 'completed' || trip.status === 'cancelled'

  return React.createElement('article',
    {
      className: 'hb-trip-card',
      onClick: () => onOpen(trip.id),
      tabIndex: 0,
      role: 'button',
      onKeyDown: (e) => { if (e.key === 'Enter') onOpen(trip.id) },
    },
    React.createElement('button',
      {
        className: 'hb-trip-card__menu',
        onClick: (e) => { e.stopPropagation(); onDelete(trip.id) },
        title: 'Delete trip',
      },
      React.createElement(tlIcons.more, { size: 16 }),
    ),
    React.createElement('div',
      { className: `hb-trip-card__cover hb-cover--${trip.cover || 'neutral'}` },
      // Image slot for user-supplied cover photo — sits behind the meta but above the gradient.
      // The component is registered as a custom element; React passes attrs through.
      React.createElement('image-slot', {
        id: `trip-cover-${trip.id}`,
        class: 'hb-trip-card__cover-slot',
        shape: 'rect',
        placeholder: 'Drop a cover photo',
      }),
      React.createElement('div', { className: 'hb-trip-card__cover-meta' },
        React.createElement('div', { className: 'hb-trip-card__icon-tile' }, trip.icon || '✈️'),
        React.createElement('div', { className: 'hb-trip-card__cover-text' },
          React.createElement('p', { className: 'hb-trip-card__cover-destination' }, trip.destination),
          React.createElement('h3', { className: 'hb-trip-card__cover-title' }, trip.title),
        ),
      ),
    ),
    React.createElement('div', { className: 'hb-trip-card__body' },
      React.createElement('div', { className: 'hb-trip-card__row' },
        React.createElement(tlIcons.calendar, { size: 14 }),
        React.createElement('span', { className: 'hb-trip-card__ellipsis' },
          React.createElement('b', null, hbFmtRange(trip.startDate, trip.endDate)),
          ` · ${days} day${days !== 1 ? 's' : ''}`,
        ),
      ),
      !dense && trip.accommodation && React.createElement('div', { className: 'hb-trip-card__row' },
        React.createElement(tlIcons.hotel, { size: 14 }),
        React.createElement('span', { className: 'hb-trip-card__ellipsis' }, trip.accommodation),
      ),
      React.createElement('div', { className: 'hb-trip-card__footer' },
        React.createElement('div', { className: 'hb-trip-card__chips hb-trip-card__chips--left' },
          React.createElement(HBStatusPill, { trip }),
          !past && upcoming && React.createElement('span',
            { className: 'hb-status hb-status--upcoming' },
            hbDaysUntil(trip.startDate),
          ),
          !past && !upcoming && (new Date() <= end) && React.createElement('span',
            { className: 'hb-status hb-status--live' },
            `day ${Math.max(1, Math.round((new Date() - start) / 86400000) + 1)} of ${days}`,
          ),
          trip.packing && trip.packing.pending > 0 && React.createElement(HBChip,
            { variant: 'outline' },
            React.createElement(tlIcons.package, { size: 11 }),
            `${trip.packing.pending} to pack`,
          ),
        ),
        React.createElement('div', { className: 'hb-trip-card__chips hb-trip-card__chips--right' },
          tagsByIds(trip.tags).slice(0, 2).map(t =>
            React.createElement(HBTagChip, { key: t.id, tag: t, variant: 'filled' })
          ),
        ),
      ),
    ),
  )
}

window.HBTripsList = function HBTripsList({ trips, onOpen, onDelete, onCreate, onOpenTags, density }) {
  const active = trips.filter(t => t.status !== 'completed' && t.status !== 'cancelled')
  const past = trips.filter(t => t.status === 'completed' || t.status === 'cancelled')

  return React.createElement('div', { className: 'hb-page' },
    React.createElement('div', { className: 'hb-page__header' },
      React.createElement('div', null,
        React.createElement('h1', { className: 'hb-display hb-page__title' }, 'Trips'),
        React.createElement('p', { className: 'hb-page__subtitle' },
          `${active.length} active · ${past.length} past`,
        ),
      ),
      React.createElement('div', { style: { display: 'flex', gap: 8 } },
        React.createElement('button', { className: 'hb-btn hb-btn--outline', onClick: onOpenTags },
          React.createElement(tlIcons.tag, { size: 14 }),
          React.createElement('span', null, 'Tags'),
        ),
        React.createElement('button', { className: 'hb-btn hb-btn--primary', onClick: onCreate },
          React.createElement(tlIcons.plus, { size: 14 }),
          React.createElement('span', null, 'New trip'),
        ),
      ),
    ),
    React.createElement('div', { className: 'hb-page__body' },
      active.length === 0 && past.length === 0
        && React.createElement('div', { className: 'hb-empty' },
            React.createElement('div', { className: 'hb-empty__icon' },
              React.createElement(tlIcons.plane, { size: 22 }),
            ),
            React.createElement('p', { className: 'hb-empty__title' }, 'No trips yet'),
            React.createElement('p', { className: 'hb-empty__hint' }, 'Plan your next adventure.'),
            React.createElement('button', { className: 'hb-btn hb-btn--primary', onClick: onCreate },
              React.createElement(tlIcons.plus, { size: 14 }),
              React.createElement('span', null, 'Create your first trip'),
            ),
          ),
      active.length > 0 && React.createElement('section', { style: { marginBottom: 28 } },
        React.createElement('div', { className: 'hb-section-head' },
          React.createElement('h2', { className: 'hb-section-head__title' }, 'Upcoming & active'),
          React.createElement('span', { className: 'hb-section-head__count' }, `${active.length}`),
        ),
        React.createElement('div', { className: 'hb-trips-grid' },
          active.map(t => React.createElement(TripCard,
            { key: t.id, trip: t, onOpen, onDelete, dense: density === 'compact' })),
        ),
      ),
      past.length > 0 && React.createElement('section', null,
        React.createElement('div', { className: 'hb-section-head' },
          React.createElement('h2', { className: 'hb-section-head__title' }, 'Past trips'),
          React.createElement('span', { className: 'hb-section-head__count' }, `${past.length}`),
        ),
        React.createElement('div', { className: 'hb-trips-grid' },
          past.map(t => React.createElement(TripCard,
            { key: t.id, trip: t, onOpen, onDelete, dense: true })),
        ),
      ),
    ),
  )
}
