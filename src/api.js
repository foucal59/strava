/**
 * API client with Strava token management.
 * Tokens stored in localStorage, auto-refresh when expired.
 */

function getTokens() {
  try {
    return JSON.parse(localStorage.getItem('strava_tokens') || 'null')
  } catch { return null }
}

function setTokens(tokens) {
  localStorage.setItem('strava_tokens', JSON.stringify(tokens))
}

export function clearTokens() {
  localStorage.removeItem('strava_tokens')
}

export function getAthlete() {
  const t = getTokens()
  return t ? { firstname: t.firstname, lastname: t.lastname, profile_pic: t.profile, id: t.athlete_id } : null
}

export function isAuthenticated() {
  return !!getTokens()?.access_token
}

export function parseAuthCallback() {
  const hash = window.location.hash
  if (!hash || hash.length < 2) return false

  const params = new URLSearchParams(hash.substring(1))
  const access_token = params.get('access_token')
  if (!access_token) return false

  setTokens({
    access_token,
    refresh_token: params.get('refresh_token'),
    expires_at: parseInt(params.get('expires_at') || '0'),
    athlete_id: params.get('athlete_id'),
    firstname: params.get('firstname'),
    lastname: params.get('lastname'),
    profile: params.get('profile'),
  })

  window.history.replaceState(null, '', window.location.pathname)
  return true
}

async function refreshToken() {
  const tokens = getTokens()
  if (!tokens?.refresh_token) throw new Error('No refresh token')

  const resp = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: tokens.refresh_token }),
  })
  if (!resp.ok) throw new Error('Refresh failed')

  const data = await resp.json()
  setTokens({ ...tokens, ...data })
  return data.access_token
}

async function getValidToken() {
  const tokens = getTokens()
  if (!tokens) throw new Error('Not authenticated')

  if (tokens.expires_at && tokens.expires_at < Date.now() / 1000 + 60) {
    return await refreshToken()
  }
  return tokens.access_token
}

async function fetchAPI(path) {
  const token = await getValidToken()
  const resp = await fetch(path, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  if (resp.status === 401) {
    const newToken = await refreshToken()
    const retry = await fetch(path, {
      headers: { 'Authorization': `Bearer ${newToken}` }
    })
    if (!retry.ok) throw new Error(`API ${retry.status}`)
    return retry.json()
  }
  if (!resp.ok) throw new Error(`API ${resp.status}`)
  return resp.json()
}

export const api = {
  cockpit: () => fetchAPI('/api/cockpit'),
  volumeWeekly: (years) => fetchAPI(`/api/volume?mode=weekly&years=${years || ''}`),
  volumeMonthly: () => fetchAPI('/api/volume?mode=monthly'),
  volumeYearly: () => fetchAPI('/api/volume?mode=yearly'),
  volumeRolling: (days) => fetchAPI(`/api/volume?mode=rolling&days=${days}`),
  records: () => fetchAPI('/api/performance?mode=records'),
  bestByYear: () => fetchAPI('/api/performance?mode=best_by_year'),
  projections: () => fetchAPI('/api/performance?mode=projections'),
  localLegends: () => fetchAPI('/api/segments?mode=legends'),
  segmentPRs: () => fetchAPI('/api/segments?mode=starred'),
  paceStability: () => fetchAPI('/api/analysis?mode=pace'),
  cardiacDecoupling: () => fetchAPI('/api/analysis?mode=cardiac'),
  volumeVsPerformance: () => fetchAPI('/api/analysis?mode=volume_perf'),
}
