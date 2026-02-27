async function fetchAPI(path) {
  const resp = await fetch(path)
  if (!resp.ok) throw new Error(`API ${resp.status}`)
  return resp.json()
}

export const api = {
  authStatus: () => fetchAPI('/api/auth/status'),
  triggerSync: () => fetch('/api/sync', { method: 'POST' }).then(r => r.json()),
  cockpit: () => fetchAPI('/api/cockpit'),
  volumeWeekly: (years) => fetchAPI(`/api/volume?mode=weekly&years=${years || ''}`),
  volumeMonthly: () => fetchAPI('/api/volume?mode=monthly'),
  volumeYearly: () => fetchAPI('/api/volume?mode=yearly'),
  volumeRolling: (days) => fetchAPI(`/api/volume?mode=rolling&days=${days}`),
  records: () => fetchAPI('/api/performance?mode=records'),
  bestByYear: () => fetchAPI('/api/performance?mode=best_by_year'),
  projections: () => fetchAPI('/api/performance?mode=projections'),
  localLegends: () => fetchAPI('/api/segments?mode=legends'),
  segmentPRs: () => fetchAPI('/api/segments?mode=prs'),
  heatmap: () => fetchAPI('/api/segments?mode=heatmap'),
  paceStability: () => fetchAPI('/api/analysis?mode=pace'),
  cardiacDecoupling: () => fetchAPI('/api/analysis?mode=cardiac'),
  volumeVsPerformance: () => fetchAPI('/api/analysis?mode=volume_perf'),
}
