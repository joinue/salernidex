import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, MapPin, Navigation, Phone, ArrowRight } from 'react-feather'
import { useScrollLock } from '../hooks/useScrollLock'
import { geocode } from '../lib/geocode'
import Avatar from './Avatar'

// Full-screen map of everyone who has an address. We use a dedicated overlay
// (not the Sheet) so Leaflet's pan gesture doesn't fight a drag-to-dismiss.
// Leaflet itself is dynamically imported here so it only loads — and only ships
// as a separate chunk — when the map is actually opened. Coordinates come from
// the cached lat/lng on each person (geocoded via lib/geocode + persisted by the
// caller), so repeat opens are instant; anyone new/changed geocodes in the
// background and their pin drops in as it resolves.
//
// Pins are the people's own avatars (rendered as real <Avatar> components
// portaled into each Leaflet marker, so Storage photos + monogram fallbacks just
// work). Tapping one raises an Apple-Maps-style card with their details and quick
// actions; tapping the map dismisses it.

// Match the basemap to the app theme — a bright map under the black dark-mode UI
// looks out of place. CARTO's free Positron / Dark Matter tiles need only
// attribution (no key, no account), so this keeps the no-lock-in stance. Mirrors
// how main.jsx resolves the theme: explicit data-theme, else the OS preference.
function darkTheme() {
  const set = document.documentElement.dataset.theme
  if (set === 'dark') return true
  if (set === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export default function PeopleMap({ people, orgsById, onClose, onOpen, onSave }) {
  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const markers = useRef(new Map()) // person id -> { marker, latlng }
  const [pins, setPins] = useState([]) // { id, person, node } — avatar portal targets
  const [selected, setSelected] = useState(null)
  const [status, setStatus] = useState('')
  const [empty, setEmpty] = useState(false)
  useScrollLock()

  // Keep latest callbacks reachable from the run-once effect without restarting it.
  const cbs = useRef({ onClose, onOpen, onSave })
  cbs.current = { onClose, onOpen, onSave }

  useEffect(() => {
    const located = people.filter((p) => p.address && p.address.trim())
    if (located.length === 0) {
      setEmpty(true)
      return
    }

    let cancelled = false
    let map = null
    const markerMap = markers.current

    ;(async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')
      if (cancelled || !mapEl.current) return

      map = L.map(mapEl.current, { zoomControl: true }).setView([20, 0], 2)
      mapRef.current = map
      const variant = darkTheme() ? 'dark_all' : 'light_all'
      L.tileLayer(`https://{s}.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}{r}.png`, {
        maxZoom: 20,
        detectRetina: true,
        subdomains: 'abcd',
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      }).addTo(map)
      map.invalidateSize()
      // Tapping empty map space dismisses the card.
      map.on('click', () => setSelected(null))

      const bounds = L.latLngBounds([])

      const addMarker = (p, lat, lng) => {
        const icon = L.divIcon({
          className: 'avatar-pin',
          html: '<span class="avatar-pin-mount"></span>',
          iconSize: [46, 54],
          iconAnchor: [23, 52],
        })
        const marker = L.marker([lat, lng], { icon, riseOnHover: true }).addTo(map)
        marker.on('click', () => {
          setSelected(p)
          map.setView([lat, lng], Math.max(map.getZoom(), 14), { animate: true })
        })
        markers.current.set(p.id, { marker, latlng: [lat, lng] })
        const node = marker.getElement()?.querySelector('.avatar-pin-mount')
        if (node) setPins((prev) => [...prev, { id: p.id, person: p, node }])
        bounds.extend([lat, lng])
      }

      const fit = () => {
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 })
      }

      // Cached coords first → instant pins. Re-geocode only if the address changed.
      const pending = []
      for (const p of located) {
        const lat = Number(p.latitude)
        const lng = Number(p.longitude)
        if (Number.isFinite(lat) && Number.isFinite(lng) && p.geocoded_address === p.address) {
          addMarker(p, lat, lng)
        } else {
          pending.push(p)
        }
      }
      fit()

      // Geocode the rest in the background; geocode() is itself serial + throttled.
      for (let i = 0; i < pending.length; i++) {
        if (cancelled) return
        const left = pending.length - i
        setStatus(`Locating ${left} ${left === 1 ? 'address' : 'addresses'}…`)
        const p = pending[i]
        try {
          const c = await geocode(p.address)
          if (cancelled) return
          if (c) {
            addMarker(p, c.lat, c.lng)
            cbs.current.onSave(
              { latitude: c.lat, longitude: c.lng, geocoded_address: p.address },
              p.id,
            )
          }
        } catch {
          /* leave for a future open */
        }
      }
      if (!cancelled) {
        fit()
        setStatus('')
      }
    })()

    return () => {
      cancelled = true
      markerMap.clear()
      if (map) map.remove()
    }
    // Snapshot the people list at open time; we don't want to re-init mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reflect selection onto the markers: highlight ring + raise above neighbours.
  useEffect(() => {
    for (const [id, { marker }] of markers.current) {
      const el = marker.getElement()
      if (!el) continue
      const on = id === selected?.id
      el.classList.toggle('selected', on)
      marker.setZIndexOffset(on ? 1000 : 0)
    }
  }, [selected, pins])

  const sub = (p) =>
    [p.role, orgsById?.get(p.organization_id)?.name].filter(Boolean).join(' · ')

  return createPortal(
    <div className="map-overlay" role="dialog" aria-label="People map">
      <header className="map-bar">
        <div className="map-bar-title">
          <MapPin size={18} />
          <span>Map</span>
          {status && <span className="map-status">{status}</span>}
        </div>
        <button className="map-close" onClick={onClose} aria-label="Done">
          <X size={20} />
        </button>
      </header>

      {empty ? (
        <div className="map-empty">
          <MapPin size={28} className="empty-icon" />
          No one has an address yet.
        </div>
      ) : (
        <div className="map-body">
          <div ref={mapEl} className="map-canvas" />

          {/* Avatars portaled into their Leaflet markers. */}
          {pins.map((p) =>
            createPortal(
              <Avatar name={p.person.name} src={p.person.avatar_url} size={40} />,
              p.node,
            ),
          )}

          {selected && (
            <div className="map-card" role="dialog" aria-label={selected.name}>
              <button
                className="map-card-open"
                onClick={() => {
                  onOpen(selected.id)
                  onClose()
                }}
              >
                <Avatar name={selected.name} src={selected.avatar_url} size={52} />
                <div className="map-card-text">
                  <div className="map-card-name">{selected.name}</div>
                  {sub(selected) && <div className="map-card-sub">{sub(selected)}</div>}
                  {selected.address && (
                    <div className="map-card-addr">
                      <MapPin size={13} />
                      {selected.address}
                    </div>
                  )}
                </div>
                <ArrowRight size={18} className="map-card-chevron" />
              </button>

              <div className="map-card-actions">
                <a
                  className="map-card-btn"
                  href={`https://maps.apple.com/?daddr=${markers.current.get(selected.id)?.latlng?.join(',') || encodeURIComponent(selected.address)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Navigation size={16} />
                  Directions
                </a>
                {selected.phone && (
                  <a className="map-card-btn" href={`tel:${selected.phone}`}>
                    <Phone size={16} />
                    Call
                  </a>
                )}
                <button
                  className="map-card-btn primary"
                  onClick={() => {
                    onOpen(selected.id)
                    onClose()
                  }}
                >
                  <ArrowRight size={16} />
                  Profile
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>,
    document.body,
  )
}
