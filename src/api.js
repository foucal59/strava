/**
 * API client with Strava token management + activity caching.
 */

const CACHE_KEY = 'strava_activities'
const CACHE_META_KEY = 'strava_cache_meta'

function getTokens() {
  try { return JSON.parse(localStorage.getItem('strava_tokens') || 'null') }
  catch { return null }
}

function setTokens(tokens) {
  localStorage.setItem('strava_tokens', JSON.stringify(tokens))
}

export function clearTokens() {
  localStorage.removeItem('strava_tokens')
  localStorage.removeItem(CACHE_KEY)
  localStorage.removeItem(CACHE_META_KEY)
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

async function fetchAPI(path, options = {}) {
  const token = await getValidToken()
  const resp = await fetch(path, {
    ...options,
    headers: { 'Authorization': `Bearer ${token}`, ...options.headers }
  })
  if (resp.status === 401) {
    const newToken = await refreshToken()
    const retry = await fetch(path, {
      ...options,
      headers: { 'Authorization': `Bearer ${newToken}`, ...options.headers }
    })
    if (!retry.ok) throw new Error(`API ${retry.status}`)
    return retry.json()
  }
  if (!resp.ok) throw new Error(`API ${resp.status}`)
  return resp.json()
}

// --- Activity Cache ---

function getCachedActivities() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function getCacheMeta() {
  try {
    const raw = localStorage.getItem(CACHE_META_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function setCachedActivities(activities) {
  const sorted = activities.sort((a, b) =>
    new Date(b.start_date_local) - new Date(a.start_date_local)
  )
  // Deduplicate by id
  const seen = new Set()
  const deduped = sorted.filter(a => {
    if (seen.has(a.id)) return false
    seen.add(a.id)
    return true
  })
  localStorage.setItem(CACHE_KEY, JSON.stringify(deduped))
  localStorage.setItem(CACHE_META_KEY, JSON.stringify({
    lastSync: Date.now(),
    count: deduped.length,
    latestDate: deduped[0]?.start_date_local || null
  }))
  return deduped
}

export async function getActivities(forceRefresh = false) {
  const cached = getCachedActivities()
  const meta = getCacheMeta()

  // If cache is fresh (< 15 min) and not forcing, return cached
  if (!forceRefresh && cached.length > 0 && meta?.lastSync && Date.now() - meta.lastSync < 15 * 60 * 1000) {
    return cached
  }

  // If we have cached data, only fetch new activities
  let afterTs = null
  if (cached.length > 0 && meta?.latestDate) {
    // Fetch activities after the most recent cached one (with 1h buffer for timezone issues)
    afterTs = Math.floor(new Date(meta.latestDate).getTime() / 1000) - 3600
  }

  const url = afterTs ? `/api/activities?after=${afterTs}` : '/api/activities'
  const result = await fetchAPI(url)

  if (!result?.activities) throw new Error('Invalid response')

  const merged = afterTs ? [...result.activities, ...cached] : result.activities
  return setCachedActivities(merged)
}

export function getCacheInfo() {
  const meta = getCacheMeta()
  const cached = getCachedActivities()
  return {
    count: cached.length,
    lastSync: meta?.lastSync ? new Date(meta.lastSync) : null,
    isStale: !meta?.lastSync || Date.now() - meta.lastSync > 15 * 60 * 1000
  }
}

// Keep the old api object for segments which still need server-side calls
export const api = {
  localLegends: () => fetchAPI('/api/segments?mode=legends'),
  segmentPRs: () => fetchAPI('/api/segments?mode=starred'),
}
