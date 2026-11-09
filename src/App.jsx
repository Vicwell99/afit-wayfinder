import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

const CATS = {
  academic: '🎓', housing: '🛏️', food: '🍽️', community: '🤝',
  recreation: '⚽', administration: '🏢', market: '🛒', health: '🏥', other: '📌',
}
const KEY = 'afit_custom_places_v1'
const CENTER = [10.6135, 7.448]
const icon = (cat) => L.divIcon({ html: `<div class="pin">${CATS[cat] || '📌'}</div>`, className: '', iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14] })

const loadCustom = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] } }
const saveCustom = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* storage unavailable */ } }

function dist(a, b) {
  const r = (x) => (x * Math.PI) / 180
  const h = Math.sin(r(b[0] - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(r(b[1] - a[1]) / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}
const fmt = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`)

function PickLayer({ active, onPick }) {
  useMapEvents({ click: (e) => active && onPick([e.latlng.lat, e.latlng.lng]) })
  return null
}
function Fly({ target }) {
  const map = useMap()
  useEffect(() => { if (target) map.flyTo(target, 19) }, [target, map])
  return null
}

export default function App() {
  const [base, setBase] = useState([])
  const [custom, setCustom] = useState(loadCustom)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [me, setMe] = useState(null)
  const [adding, setAdding] = useState(false)
  const [pick, setPick] = useState(null)
  const [acc, setAcc] = useState(null)
  const [form, setForm] = useState({ name: '', category: 'academic', description: '' })
  const [fly, setFly] = useState(null)

  useEffect(() => {
    fetch('/campus-data.json').then((r) => r.json()).then((d) =>
      setBase(d.features.map((f) => ({
        id: f.properties.id, name: f.properties.name, category: f.properties.category,
        description: f.properties.description, keywords: f.properties.search_keywords || [],
        pos: [f.geometry.coordinates[1], f.geometry.coordinates[0]], custom: false,
      })))).catch(() => {})
  }, [])

  const locate = (cb) => {
    if (!navigator.geolocation) return alert('GPS is not supported on this device.')
    navigator.geolocation.getCurrentPosition((p) => {
      const ll = [p.coords.latitude, p.coords.longitude]
      setMe(ll); cb?.(ll, p.coords.accuracy)
    }, (e) => alert('Could not get location: ' + e.message), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 })
  }
  useEffect(() => { locate() }, [])

  const all = useMemo(() => [...base, ...custom], [base, custom])
  const list = useMemo(() => {
    const s = q.toLowerCase()
    return all
      .filter((p) => (cat === 'all' || p.category === cat) &&
        (`${p.name} ${p.description} ${p.category} ${(p.keywords || []).join(' ')}`).toLowerCase().includes(s))
      .sort((a, b) => (me ? dist(me, a.pos) - dist(me, b.pos) : 0))
  }, [all, q, cat, me])

  const cats = ['all', ...new Set([...Object.keys(CATS), ...all.map((p) => p.category)])]

  const closeForm = () => { setAdding(false); setPick(null); setAcc(null); setForm({ name: '', category: 'academic', description: '' }) }
  const savePlace = () => {
    if (!form.name.trim()) return alert('Enter a name.')
    if (!pick) return alert('Set the location first.')
    const next = [...custom, { id: 'c' + Date.now(), ...form, name: form.name.trim(), pos: pick, custom: true, keywords: [] }]
    setCustom(next); saveCustom(next); closeForm()
  }
  const del = (id) => { if (confirm('Delete this place?')) { const n = custom.filter((p) => p.id !== id); setCustom(n); saveCustom(n) } }
  const exportJson = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(custom, null, 2)], { type: 'application/json' }))
    a.download = 'afit-custom-places.json'; a.click()
  }
  const importJson = (e) => {
    const f = e.target.files[0]; if (!f) return
    f.text().then((t) => { try { const d = JSON.parse(t); if (Array.isArray(d)) { setCustom(d); saveCustom(d) } } catch { alert('Invalid file') } })
  }

  return (
    <div className="app">
      <div className="bar">
        <h1>📍 AFIT</h1>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search hall, hostel, cafeteria…" />
        <button onClick={() => setAdding(true)}>+ Add</button>
      </div>
      <div className="mapwrap">
        <MapContainer center={CENTER} zoom={16} maxZoom={19}>
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" maxZoom={19} />
          <PickLayer active={adding} onPick={setPick} />
          <Fly target={fly} />
          {list.map((p) => (
            <Marker key={p.id} position={p.pos} icon={icon(p.category)}>
              <Popup>
                <b>{p.name}</b><br />{p.category}<br />{p.description}<br />
                <a target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${p.pos[0]},${p.pos[1]}&travelmode=walking`}>Directions</a>
              </Popup>
            </Marker>
          ))}
          {me && <CircleMarker center={me} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#0b5fff', fillOpacity: 1 }} />}
          {pick && <Marker position={pick} draggable eventHandlers={{ dragend: (e) => { const l = e.target.getLatLng(); setPick([l.lat, l.lng]) } }} />}
        </MapContainer>
      </div>
      {adding ? (
        <div className="form">
          <b>Add a place</b>
          <input placeholder="Name (e.g. Block C Lecture Hall)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="row">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {Object.keys(CATS).map((c) => <option key={c}>{c}</option>)}
            </select>
            <button className="sec" onClick={() => locate((ll, a) => { setPick(ll); setAcc(a); setFly(ll) })}>Use my exact location</button>
          </div>
          <textarea rows={2} placeholder="How to find it (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <small>{pick ? `Spot: ${pick[0].toFixed(6)}, ${pick[1].toFixed(6)}${acc ? ` · ±${Math.round(acc)} m` : ''} (drag pin to adjust)` : 'Tap the map or use GPS to set the spot.'}</small>
          <div className="row"><button onClick={savePlace}>Save place</button><button className="sec" onClick={closeForm}>Cancel</button></div>
        </div>
      ) : (
        <div className="panel">
          <div className="chips">
            {cats.map((c) => <button key={c} className={`chip ${c === cat ? 'on' : ''}`} onClick={() => setCat(c)}>{CATS[c] || ''} {c}</button>)}
          </div>
          {list.map((p) => (
            <div className="item" key={p.id}>
              <div><b>{CATS[p.category] || '📌'} {p.name}</b><small>{p.category}{me ? ` · ${fmt(dist(me, p.pos))}` : ''}</small></div>
              <div className="acts">
                <button className="sec" onClick={() => setFly([...p.pos])}>Go</button>
                {p.custom && <button className="sec" onClick={() => del(p.id)}>✕</button>}
              </div>
            </div>
          ))}
          <div className="row" style={{ marginTop: 8 }}>
            <button className="sec" onClick={exportJson}>Export my places</button>
            <button className="sec" onClick={() => document.getElementById('imp').click()}>Import</button>
          </div>
          <input id="imp" type="file" accept="application/json" hidden onChange={importJson} />
        </div>
      )}
    </div>
  )
}
