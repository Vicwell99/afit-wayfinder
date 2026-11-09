import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { api } from './api'

const CATS = { academic: '🎓', housing: '🛏️', food: '🍽️', community: '🤝', recreation: '⚽', administration: '🏢', market: '🛒', health: '🏥', other: '📌' }
const CENTER = [7.448, 10.6135] // [lng, lat]
const STYLE = 'https://tiles.openfreemap.org/styles/liberty' // free vector tiles with 3D buildings
const ROUTER = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot/'
const EMPTY = { id: null, name: '', category: 'academic', description: '' }

const rad = (x) => (x * Math.PI) / 180
function dist(a, b) { // a, b = [lat, lng]
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}
function bearing(a, b) { // a, b = [lng, lat]
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]))
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}
const fmt = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`)
const mins = (m) => Math.max(1, Math.round(m / 80)) // ~4.8 km/h walking
const pinEl = (c) => { const d = document.createElement('div'); d.className = 'pin'; d.textContent = CATS[c] || '📌'; return d }

export default function MapView({ user, places, status, onChanged, onLogout, onUsers, onLogin }) {
  const isAdmin = user?.role === 'admin'
  const box = useRef(null), mapRef = useRef(null), meMarker = useRef(null), watchId = useRef(null)
  const [ready, setReady] = useState(false)
  const [mapErr, setMapErr] = useState('')
  const [is3d, setIs3d] = useState(true)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [me, setMe] = useState(null)
  const [form, setForm] = useState(null)
  const [pick, setPick] = useState(null)
  const [acc, setAcc] = useState(null)
  const [fly, setFly] = useState(null)
  const [err, setErr] = useState('')
  const [nav, setNav] = useState(null) // { place, line, dist, straight, active, arrived }

  // ----- create the 3D map once -----
  useEffect(() => {
    let map
    try {
      map = new maplibregl.Map({ container: box.current, style: STYLE, center: CENTER, zoom: 16.5, pitch: 55, bearing: -15, maxPitch: 75 })
    } catch { setTimeout(() => setMapErr('3D maps need WebGL, which this device or browser does not support.'), 0); return }
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    map.on('load', () => {
      map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': 9 } })
      map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0b5fff', 'line-width': 5 } })
      setReady(true)
    })
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null; setReady(false) }
  }, [])

  // ----- GPS -----
  const locate = (cb) => {
    if (!navigator.geolocation) return alert('GPS is not supported on this device.')
    navigator.geolocation.getCurrentPosition((p) => {
      const ll = [p.coords.latitude, p.coords.longitude]
      setMe(ll); cb?.(ll, p.coords.accuracy)
    }, (e) => alert('Could not get location: ' + e.message), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 })
  }
  useEffect(() => { const t = setTimeout(() => locate(), 0); return () => clearTimeout(t) }, [])

  useEffect(() => { // blue "you are here" dot
    if (!ready || !me) return
    if (!meMarker.current) {
      const el = document.createElement('div'); el.className = 'me-dot'
      meMarker.current = new maplibregl.Marker({ element: el }).setLngLat([me[1], me[0]]).addTo(mapRef.current)
    } else meMarker.current.setLngLat([me[1], me[0]])
  }, [me, ready])

  // ----- place markers -----
  const list = useMemo(() => {
    const s = q.toLowerCase()
    return places
      .filter((p) => (cat === 'all' || p.category === cat) &&
        `${p.name} ${p.description} ${p.category} ${(p.keywords || []).join(' ')}`.toLowerCase().includes(s))
      .sort((a, b) => (me ? dist(me, [a.lat, a.lng]) - dist(me, [b.lat, b.lng]) : 0))
  }, [places, q, cat, me])
  const cats = ['all', ...new Set([...Object.keys(CATS), ...places.map((p) => p.category)])]

  const routeTo = async (p) => {
    const map = mapRef.current
    let from = me
    if (!from) {
      from = await new Promise((res) => navigator.geolocation?.getCurrentPosition((x) => res([x.coords.latitude, x.coords.longitude]), () => res(null), { enableHighAccuracy: true, timeout: 15000 }))
      if (!from) return alert('Turn on location to get directions.')
      setMe(from)
    }
    const to = [p.lat, p.lng]
    let line = [[from[1], from[0]], [to[1], to[0]]], d = dist(from, to), straight = true
    try {
      const r = await (await fetch(`${ROUTER}${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`)).json()
      if (r.routes?.[0]) { line = r.routes[0].geometry.coordinates; d = r.routes[0].distance; straight = false }
    } catch { /* fall back to a straight line */ }
    map.getSource('route').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: line } })
    map.setPaintProperty('route-line', 'line-dasharray', straight ? [1.5, 1.5] : [1, 0])
    const b = new maplibregl.LngLatBounds(); line.forEach((c) => b.extend(c))
    map.fitBounds(b, { padding: { top: 90, bottom: 200, left: 50, right: 50 }, pitch: 55, bearing: bearing(line[0], line[Math.min(line.length - 1, 3)]), maxZoom: 19, duration: 1200 })
    setNav({ place: p, line, dist: d, straight, active: false, arrived: false })
  }
  const clearRoute = () => {
    stopWatch(); mapRef.current?.getSource('route')?.setData({ type: 'FeatureCollection', features: [] }); setNav(null)
  }
  const stopWatch = () => { if (watchId.current != null) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null } }
  const startNav = () => {
    if (!nav || !navigator.geolocation) return
    setNav((n) => ({ ...n, active: true }))
    watchId.current = navigator.geolocation.watchPosition((p) => {
      const ll = [p.coords.latitude, p.coords.longitude]
      setMe(ll)
      const left = dist(ll, [nav.place.lat, nav.place.lng])
      const ahead = nav.line.find((c) => dist(ll, [c[1], c[0]]) > 25) || nav.line[nav.line.length - 1]
      const hd = p.coords.heading != null && !Number.isNaN(p.coords.heading) && p.coords.speed > 0.5 ? p.coords.heading : bearing([ll[1], ll[0]], ahead)
      mapRef.current?.easeTo({ center: [ll[1], ll[0]], zoom: 19, pitch: 65, bearing: hd, duration: 800 })
      setNav((n) => (n ? { ...n, left, arrived: left < 20 } : n))
    }, () => {}, { enableHighAccuracy: true, maximumAge: 1000 })
  }
  useEffect(() => stopWatch, [])

  const routeRef = useRef(routeTo); useEffect(() => { routeRef.current = routeTo })
  useEffect(() => {
    if (!ready) return
    const markers = list.map((p) => {
      const pop = document.createElement('div')
      const t = document.createElement('b'); t.textContent = p.name
      const c = document.createElement('div'); c.textContent = p.category + (p.description ? ' · ' + p.description : '')
      const btn = document.createElement('button'); btn.textContent = '🧭 Directions'; btn.style.marginTop = '6px'
      btn.onclick = () => { routeRef.current(p); markers.forEach((m) => m.getPopup().remove()) }
      pop.append(t, c, btn)
      return new maplibregl.Marker({ element: pinEl(p.category) }).setLngLat([p.lng, p.lat])
        .setPopup(new maplibregl.Popup({ offset: 18, className: 'afit-pop' }).setDOMContent(pop)).addTo(mapRef.current)
    })
    return () => markers.forEach((m) => m.remove())
  }, [list, ready])

  // ----- admin: pick / drag a location -----
  const picking = !!form
  useEffect(() => {
    if (!ready || !picking) return
    const map = mapRef.current
    const click = (e) => setPick([e.lngLat.lat, e.lngLat.lng])
    map.on('click', click)
    return () => map.off('click', click)
  }, [ready, picking])
  useEffect(() => {
    if (!ready || !picking || !pick) return
    const m = new maplibregl.Marker({ draggable: true, color: '#d93025' }).setLngLat([pick[1], pick[0]]).addTo(mapRef.current)
    m.on('dragend', () => { const l = m.getLngLat(); setPick([l.lat, l.lng]) })
    return () => m.remove()
  }, [pick, picking, ready])

  useEffect(() => {
    if (fly && mapRef.current) mapRef.current.flyTo({ center: [fly.pos[1], fly.pos[0]], zoom: 18.5, pitch: is3d ? 60 : 0, duration: 1200 })
  }, [fly]) // eslint-disable-line react-hooks/exhaustive-deps
  const toggle3d = () => { const n = !is3d; setIs3d(n); mapRef.current?.easeTo({ pitch: n ? 60 : 0, bearing: n ? mapRef.current.getBearing() : 0, duration: 600 }) }

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
        <div ref={box} className="map3d" />
        {mapErr && <div className="maperr">{mapErr}</div>}
        <button className="sec btn3d" onClick={toggle3d}>{is3d ? '3D' : '2D'}</button>
        {nav && (
          <div className="navcard">
            <b>🧭 {nav.place.name}</b>
            <div>{nav.arrived ? "You've arrived 🎉" : `${fmt(nav.left ?? nav.dist)} · about ${mins(nav.left ?? nav.dist)} min walk`}{nav.straight && !nav.arrived ? ' (straight line: no walking path found)' : ''}</div>
            <div className="row">
              {!nav.active && <button onClick={startNav}>Start</button>}
              <a className="btnlike" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${nav.place.lat},${nav.place.lng}&travelmode=walking`}>Google Maps</a>
              <button className="sec" onClick={clearRoute}>{nav.active ? 'Stop' : 'Close'}</button>
            </div>
          </div>
        )}
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
                <button onClick={() => routeTo(p)}>🧭</button>
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
