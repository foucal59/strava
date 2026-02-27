const API_BASE = ''

async function fetchAPI(path, params = {}) {
  const url = new URL(path, window.location.origin)
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v)
  })
  const resp = await fetch(url.toString())
  if (!resp.ok) throw new Error(`API error: ${resp.status}`)
  return resp.json()
}

export const api = {
  // Auth
  authStatus: () => fetchAPI('/auth/status'),

  // Sync
  triggerSync: () => fetch('/sync', { method: 'POST' }).then(r => r.json()),
  syncStatus: () => fetchAPI('/sync/status'),

  // Cockpit
  cockpit: () => fetchAPI('/api/cockpit'),

  // Volume
  volumeWeekly: (years) => fetchAPI('/api/volume/weekly', { years }),
  volumeMonthly: () => fetchAPI('/api/volume/monthly'),
  volumeYearly: () => fetchAPI('/api/volume/yearly'),
  volumeRolling: (days) => fetchAPI('/api/volume/rolling', { days }),

  // Performance
  records: () => fetchAPI('/api/performance/records'),
  bestByYear: () => fetchAPI('/api/performance/best-by-year'),

  // Projections
  projections: () => fetchAPI('/api/projections'),

  // Segments
  localLegends: () => fetchAPI('/api/segments/local-legends'),
  segmentPRs: () => fetchAPI('/api/segments/prs'),
  heatmap: () => fetchAPI('/api/segments/heatmap'),

  // Analysis
  paceStability: () => fetchAPI('/api/analysis/pace-stability'),
  cardiacDecoupling: () => fetchAPI('/api/analysis/cardiac-decoupling'),
  volumeVsPerformance: () => fetchAPI('/api/analysis/volume-vs-performance'),

  // Activities
  activities: (params) => fetchAPI('/api/activities', params),
}
