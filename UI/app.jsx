// Top-level demo app. Manages routing between trips list + detail.

const { useState: useAppState } = React

function App() {
  const [t, setTweak] = useTweaks(/*EDITMODE-BEGIN*/{
    "tab_style": "segmented",
    "card_style": "hero",
    "density": "comfortable",
    "theme": "default"
  }/*EDITMODE-END*/)

  const [view, setView] = useAppState('list')    // 'list' | 'detail'
  const [currentTripId, setCurrentTripId] = useAppState(null)
  const [trips, setTrips] = useAppState(HB_DATA.TRIPS)
  const tags = HB_DATA.TAGS

  // Apply tweaks via data attrs on the root
  const rootClass = [
    'hb-trips',
    `hb-tabstyle-${t.tab_style}`,
    `hb-cardstyle-${t.card_style}`,
    `hb-density-${t.density}`,
    `hb-theme-${t.theme}`,
  ].join(' ')

  function openTrip(id) {
    setCurrentTripId(id)
    setView('detail')
  }
  function deleteTrip(id) {
    if (!confirm('Delete this trip?')) return
    setTrips(prev => prev.filter(t => t.id !== id))
  }

  const currentTrip = trips.find(x => x.id === currentTripId)

  return React.createElement('div', { className: rootClass, style: { height: '100%' } },
    view === 'list'
      ? React.createElement(HBTripsList, {
          trips, onOpen: openTrip, onDelete: deleteTrip,
          onCreate: () => alert('New trip dialog — wire up to /api/trips POST'),
          onOpenTags: () => alert('Tag manager — opens existing TripTagsManager'),
          density: t.density,
        })
      : currentTrip && React.createElement(HBTripDetail, {
          trip: currentTrip,
          days: HB_DATA.TOKYO_DAYS,
          tags,
          onBack: () => setView('list'),
          onOpenTags: () => alert('Tag manager'),
        }),

    React.createElement(TweaksPanel, { title: 'Tweaks' },
      React.createElement(TweakSection, { title: 'Layout' },
        React.createElement(TweakRadio, {
          label: 'Detail tab style',
          value: t.tab_style,
          options: [
            { value: 'segmented', label: 'Segmented' },
            { value: 'pill',      label: 'Pill row' },
            { value: 'underline', label: 'Underline' },
          ],
          onChange: v => setTweak('tab_style', v),
        }),
        React.createElement(TweakRadio, {
          label: 'Trip card style',
          value: t.card_style,
          options: [
            { value: 'hero',     label: 'Hero cover' },
            { value: 'minimal',  label: 'Minimal' },
          ],
          onChange: v => setTweak('card_style', v),
        }),
        React.createElement(TweakRadio, {
          label: 'Density',
          value: t.density,
          options: [
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'compact',     label: 'Compact' },
          ],
          onChange: v => setTweak('density', v),
        }),
      ),
      React.createElement(TweakSection, { title: 'App theme', subtitle: 'Try the cover gradients as a system-wide accent' },
        React.createElement(TweakRadio, {
          label: 'Theme',
          value: t.theme,
          options: [
            { value: 'default', label: 'Default' },
            { value: 'ocean',   label: 'Ocean' },
            { value: 'alpine',  label: 'Alpine' },
            { value: 'blossom', label: 'Blossom' },
          ],
          onChange: v => setTweak('theme', v),
        }),
      ),
    ),
  )
}

// Bootstrap
const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(React.createElement(App))
