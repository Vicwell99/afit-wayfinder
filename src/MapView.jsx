import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { api } from './api'

const CATS = { academic: '🎓', housing: '🛏️', food: '🍽️', community: '🤝', recreation: '⚽', administration: '🏢', market: '🛒', health: '🏥', other: '📌' }
const CENTER = [10.6135, 7.448]
const icon = (c) => L.divIcon({ html: `<div class="pin">${CATS[c] || '📌'}</div>`, className: '', iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14] })
const EMPTY = { id: null, name: '', category: 'academic', description: '' }

function dist(a, b) {
  const r = (x) => (x * Math.PI) / 180
  const h = Math.sin(r(b[0] - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(r(b[1] - a[1]) / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}
const fmt = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`)

function Picker({ active, onPick }) {
  useMapEvents({ click: (e) => active && onPick([e.latlng.lat, e.latlng.lng]) })
  return null
}
function Fly({ target }) {
  const map = useMap()
  useEffect(() => { if (target) map.flyTo(target.pos, 19) }, [target, map])
  return null
}

export default function MapView({ user, places, status, onChanged, onLogout, onUsers, onLogin }) {
  const isAdmin = user?.role === 'admin'
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [me, setMe] = useState(null)
  const [form, setForm] = useState(null)
  const [pick, setPick] = useState(null)
  const [acc, setAcc] = useState(null)
  const [fly, setFly] = useState(null)
  const [err, setErr] = useState('')

  const locate = (cb) => {
    if (!navigator.geolocation) return alert('GPS is not supported on this device.')
    navigator.geolocation.getCurrentPosition((p) => {
      const ll = [p.coords.latitude, p.coords.longitude]
      setMe(ll); cb?.(ll, p.coords.accuracy)
    }, (e) => alert('Could not get location: ' + e.message), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 })
  }
  useEffect(() => { locate() }, [])

  const list = useMemo(() => {
    const s = q.toLowerCase()
    return places
      .filter((p) => (cat === 'all' || p.category === cat) &&
        `${p.name} ${p.description} ${p.category} ${(p.keywords || []).join(' ')}`.toLowerCase().includes(s))
      .sort((a, b) => (me ? dist(me, [a.lat, a.lng]) - dist(me, [b.lat, b.lng]) : 0))
  }, [places, q, cat, me])
  const cats = ['all', ...new Set([...Object.keys(CATS), ...places.map((p) => p.category)])]

  const close = () => { setForm(null); setPick(null); setAcc(null); setErr('') }
  const edit = (p) => { setForm({ id: p.id, name: p.name, category: p.category, description: p.description }); setPick([p.lat, p.lng]); setFly({ pos: [p.lat, p.lng] }) }
  const save = async () => {
    setErr('')
    if (!form.name.trim()) return setErr('Enter a name.')
    if (!pick) return setErr('Set the location first.')
    try {
      const body = { name: form.name, category: form.category, description: form.description, lat: pick[0], lng: pick[1] }
      await api(form.id ? '/places/' + form.id : '/places', { method: form.id ? 'PUT' : 'POST', body })
      close(); onChanged()
    } catch (e) { setErr(e.message) }
  }
  const del = async (p) => {
    if (!confirm(`Delete "${p.name}" for everyone?`)) return
    try { await api('/places/' + p.id, { method: 'DELETE' }); onChanged() } catch (e) { alert(e.message) }
  }

  return (
    <div className="app">
      <div className="bar">
        <h1>📍 AFIT</h1>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search hall, hostel, cafeteria…" />
        {isAdmin && <button onClick={() => setForm({ ...EMPTY })}>+ Add</button>}
      </div>
      <div className="bar sub">
        <small>{user ? `${user.name} · ${user.role}` : 'Guest'}{status === 'offline' ? ' · offline copy' : ''}</small>
        <div className="acts">
          {isAdmin && <button className="sec" onClick={onUsers}>Users</button>}
          {user ? <button className="sec" onClick={onLogout}>Log out</button> : <button className="sec" onClick={onLogin}>Log in</button>}
        </div>
      </div>
      <div className="mapwrap">
        <MapContainer center={CENTER} zoom={16} maxZoom={19}>
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" maxZoom={19} />
          <Picker active={!!form} onPick={setPick} />
          <Fly target={fly} />
          {list.map((p) => (
            <Marker key={p.id} position={[p.lat, p.lng]} icon={icon(p.category)}>
              <Popup>
                <b>{p.name}</b><br />{p.category}<br />{p.description}<br />
                <a target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=walking`}>Directions</a>
              </Popup>
            </Marker>
          ))}
          {me && <CircleMarker center={me} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#0b5fff', fillOpacity: 1 }} />}
          {pick && form && <Marker position={pick} draggable eventHandlers={{ dragend: (e) => { const l = e.target.getLatLng(); setPick([l.lat, l.lng]) } }} />}
        </MapContainer>
      </div>
      {form ? (
        <div className="form">
          <b>{form.id ? 'Edit place' : 'Add a place'}</b>
          <input placeholder="Name (e.g. Block C Lecture Hall)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="row">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {cats.filter((c) => c !== 'all').map((c) => <option key={c}>{c}</option>)}
            </select>
            <button className="sec" onClick={() => locate((ll, a) => { setPick(ll); setAcc(a); setFly({ pos: ll }) })}>Use my exact location</button>
          </div>
          <textarea rows={2} placeholder="How to find it (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <small>{pick ? `Spot: ${pick[0].toFixed(6)}, ${pick[1].toFixed(6)}${acc ? ` · ±${Math.round(acc)} m` : ''} (drag pin to adjust)` : 'Tap the map or use GPS to set the spot.'}</small>
          {err && <div className="err">{err}</div>}
          <div className="row"><button onClick={save}>Save for everyone</button><button className="sec" onClick={close}>Cancel</button></div>
        </div>
      ) : (
        <div className="panel">
          <div className="chips">
            {cats.map((c) => <button key={c} className={`chip ${c === cat ? 'on' : ''}`} onClick={() => setCat(c)}>{CATS[c] || ''} {c}</button>)}
          </div>
          {list.map((p) => (
            <div className="item" key={p.id}>
              <div><b>{CATS[p.category] || '📌'} {p.name}</b><small>{p.category}{me ? ` · ${fmt(dist(me, [p.lat, p.lng]))}` : ''}</small></div>
              <div className="acts">
                <button className="sec" onClick={() => setFly({ pos: [p.lat, p.lng] })}>Go</button>
                {isAdmin && <button className="sec" onClick={() => edit(p)}>Edit</button>}
                {isAdmin && <button className="sec" onClick={() => del(p)}>✕</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
