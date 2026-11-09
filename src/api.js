const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const store = {
  get: (k) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } },
  del: (k) => { try { localStorage.removeItem(k) } catch { /* ignore */ } },
}
export { store }
export const getToken = () => store.get('afit_token')
export const setToken = (t) => (t ? store.set('afit_token', t) : store.del('afit_token'))

export async function api(path, { method = 'GET', body } = {}) {
  const headers = {}
  const t = getToken()
  if (t) headers.Authorization = 'Bearer ' + t
  if (body) headers['Content-Type'] = 'application/json'
  let res
  try {
    res = await fetch(BASE + '/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000) })
  } catch (x) {
    const slow = x?.name === 'TimeoutError'
    const e = new Error(slow ? 'The server is taking too long to respond (it may be waking up). Please try again in a moment.' : 'Cannot reach the server. Check your connection.'); e.offline = true; throw e
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { const e = new Error(data.error || `Server unavailable (error ${res.status}). Please try again shortly.`); e.status = res.status; throw e }
  return data
}
export const imgUrl = (id) => BASE + '/api/images/' + id
