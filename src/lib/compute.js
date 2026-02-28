/**
 * Client-side activity data computation.
 * Replaces server-side computation to leverage cached activities.
 */

// --- Helpers ---
function parseDate(d) {
  return new Date(d.replace('Z', '').replace('+00:00', ''))
}

export function fmtTime(seconds) {
  if (!seconds) return '-'
  seconds = Math.round(seconds)
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return h > 0 ? `${h}h${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`
}

export function fmtPace(seconds) {
  if (!seconds) return '-'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2,'0')}`
}

function matchDistance(distM, type) {
  const thresholds = {
    '5k': [4500, 5500],
    '10k': [9500, 10500],
    'semi': [20500, 22000],
    'marathon': [41500, 43500],
  }
  const [lo, hi] = thresholds[type] || [0, 0]
  return distM >= lo && distM <= hi
}

export function riegel(t1, d1, d2) {
  return t1 * Math.pow(d2 / d1, 1.06)
}

function paceForDist(timeS, distType) {
  const dists = { '5k': 5, '10k': 10, 'semi': 21.0975, 'marathon': 42.195 }
  const d = dists[distType]
  if (!d || !timeS) return ''
  const p = timeS / d
  return `${Math.floor(p / 60)}:${String(Math.floor(p % 60)).padStart(2,'0')}/km`
}

function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
}

// --- Cockpit ---
export function computeCockpit(activities) {
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1))
  weekStart.setHours(0, 0, 0, 0)

  const d90 = new Date(now - 90 * 86400000)
  const d28 = new Date(now - 28 * 86400000)
  const d180 = new Date(now - 180 * 86400000)

  let weekVol = 0, vol90 = 0, vol28 = 0, prev90 = 0
  activities.forEach(a => {
    const dt = parseDate(a.start_date_local)
    const dist = a.distance || 0
    if (dt >= weekStart) weekVol += dist
    if (dt >= d90) vol90 += dist
    if (dt >= d28) vol28 += dist
    if (dt >= d180 && dt < d90) prev90 += dist
  })

  const avg4w = vol28 / 4
  const alerts = []
  if (avg4w > 0 && weekVol > avg4w * 1.2) {
    alerts.push({ type: 'warning', message: `Volume semaine +${Math.round((weekVol / avg4w - 1) * 100)}% vs moyenne 4 sem.` })
  }
  if (prev90 > 0 && vol90 < prev90 * 0.85) {
    alerts.push({ type: 'danger', message: `Volume 90j en baisse de ${Math.round((1 - vol90 / prev90) * 100)}%` })
  }

  const prs = computePRs(activities)
  const pr90d = Object.values(prs).reduce((sum, dist) => {
    return sum + dist.filter(p => p.isBest && parseDate(p.date) >= d90).length
  }, 0)

  const projections = {}
  const projSources = [
    ['10k', 10000, [['semi', 21097.5], ['marathon', 42195]]],
    ['semi', 21097.5, [['marathon', 42195]]],
  ]
  projSources.forEach(([src, srcDist, targets]) => {
    if (prs[src]?.length) {
      const bestRec = prs[src][0]
      const best = bestRec.time
      const bestDate = bestRec.date?.slice(0, 10) || ''
      targets.forEach(([tgtName, tgtDist]) => {
        const proj = riegel(best, srcDist, tgtDist)
        projections[`${tgtName}_from_${src}`] = {
          seconds: Math.round(proj),
          formatted: fmtTime(Math.round(proj)),
          source_time: fmtTime(best),
          source_distance: src,
          source_date: bestDate,
        }
      })
    }
  })

  // Recent runs for mini-map on cockpit
  const recentRuns = activities
    .filter(a => a.summary_polyline)
    .slice(0, 10)
    .map(a => ({
      id: a.id,
      name: a.name,
      date: a.start_date_local,
      distance: a.distance,
      polyline: a.summary_polyline,
      start_latlng: a.start_latlng,
    }))

  return {
    week_volume: Math.round(weekVol / 10) / 100,
    volume_90d: Math.round(vol90 / 10) / 100,
    avg_4_weeks: Math.round(avg4w / 10) / 100,
    pr_90d: pr90d,
    projections,
    alerts,
    total_activities: activities.length,
    recent_runs: recentRuns,
  }
}

// --- PRs ---
export function computePRs(activities) {
  const prs = {}
  const types = ['5k', '10k', 'semi', 'marathon']
  types.forEach(distType => {
    const matching = activities
      .filter(a => matchDistance(a.distance || 0, distType))
      .map(a => ({
        date: a.start_date_local,
        time: a.moving_time,
        activity_id: a.id,
        distance: a.distance,
        formatted: fmtTime(a.moving_time),
        pace: paceForDist(a.moving_time, distType),
        polyline: a.summary_polyline,
      }))
      .sort((a, b) => a.time - b.time)

    if (matching.length) {
      const bestTime = matching[0].time
      matching.forEach(m => {
        m.isBest = m.time === bestTime
        m.pctOffBest = bestTime > 0 ? Math.round(((m.time - bestTime) / bestTime) * 1000) / 10 : 0
      })
    }
    prs[distType] = matching
  })
  return prs
}

// --- Volume ---
export function computeWeekly(activities, yearFilter) {
  const buckets = {}
  activities.forEach(a => {
    const dt = parseDate(a.start_date_local)
    const yr = String(dt.getFullYear())
    if (yearFilter?.length && !yearFilter.includes(yr)) return
    const wk = getWeekNumber(dt)
    const key = `${yr}-${wk}`
    if (!buckets[key]) buckets[key] = { year: yr, week: String(wk).padStart(2, '0'), km: 0, runs: 0, time_s: 0, elev: 0 }
    buckets[key].km += a.distance / 1000
    buckets[key].runs++
    buckets[key].time_s += a.moving_time || 0
    buckets[key].elev += a.total_elevation_gain || 0
  })
  const rows = Object.values(buckets).sort((a, b) => a.year === b.year ? a.week.localeCompare(b.week) : a.year.localeCompare(b.year))
  rows.forEach(r => { r.km = Math.round(r.km * 100) / 100; r.elev = Math.round(r.elev * 10) / 10 })
  rows.forEach((d, i) => {
    const window = rows.slice(Math.max(0, i - 3), i + 1)
    d.ma_4w = Math.round(window.reduce((s, w) => s + w.km, 0) / window.length * 100) / 100
  })
  return rows
}

export function computeMonthly(activities) {
  const buckets = {}
  activities.forEach(a => {
    const dt = parseDate(a.start_date_local)
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
    if (!buckets[key]) buckets[key] = { year: String(dt.getFullYear()), month: String(dt.getMonth() + 1).padStart(2, '0'), km: 0, runs: 0, time_s: 0 }
    buckets[key].km += a.distance / 1000
    buckets[key].runs++
    buckets[key].time_s += a.moving_time || 0
  })
  return Object.values(buckets).sort((a, b) => `${a.year}-${a.month}`.localeCompare(`${b.year}-${b.month}`)).map(r => ({ ...r, km: Math.round(r.km * 100) / 100 }))
}

export function computeYearly(activities) {
  const buckets = {}
  activities.forEach(a => {
    const dt = parseDate(a.start_date_local)
    const yr = String(dt.getFullYear())
    if (!buckets[yr]) buckets[yr] = { year: yr, km: 0, runs: 0, time_s: 0, elev: 0 }
    buckets[yr].km += a.distance / 1000
    buckets[yr].runs++
    buckets[yr].time_s += a.moving_time || 0
    buckets[yr].elev += a.total_elevation_gain || 0
  })
  return Object.values(buckets).sort((a, b) => a.year.localeCompare(b.year)).map(r => ({ ...r, km: Math.round(r.km * 100) / 100, elev: Math.round(r.elev * 10) / 10 }))
}

export function computeRolling(activities, days = 90) {
  const now = new Date()
  const start = new Date(now - days * 2 * 86400000)
  const daily = {}
  activities.forEach(a => {
    const dt = parseDate(a.start_date_local)
    if (dt < start) return
    const d = dt.toISOString().slice(0, 10)
    daily[d] = (daily[d] || 0) + a.distance / 1000
  })
  const result = []
  const d = new Date(start)
  while (d <= now) {
    const ds = d.toISOString().slice(0, 10)
    const ws = new Date(d - days * 86400000).toISOString().slice(0, 10)
    const total = Object.entries(daily).reduce((s, [k, v]) => k >= ws && k <= ds ? s + v : s, 0)
    result.push({ date: ds, km: Math.round(total * 100) / 100 })
    d.setDate(d.getDate() + 1)
  }
  return result
}

// --- Performance ---
export function computeBestByYear(prs) {
  const result = {}
  Object.entries(prs).forEach(([distType, records]) => {
    const byYear = {}
    records.forEach(r => {
      const yr = r.date.slice(0, 4)
      if (!byYear[yr] || r.time < byYear[yr].time) byYear[yr] = r
    })
    result[distType] = Object.entries(byYear)
      .map(([yr, v]) => ({ year: yr, time: v.time, formatted: v.formatted, pace: v.pace }))
      .sort((a, b) => a.year.localeCompare(b.year))
  })
  return result
}

export function computeProjections(prs, activities) {
  const projections = {}
  const sources = [
    ['10k', 10000, [['semi', 21097.5], ['marathon', 42195]]],
    ['semi', 21097.5, [['marathon', 42195]]],
  ]
  sources.forEach(([src, srcDist, targets]) => {
    if (prs[src]?.length) {
      const best = prs[src][0].time
      targets.forEach(([tgtName, tgtDist]) => {
        const proj = riegel(best, srcDist, tgtDist)
        projections[`${tgtName}_from_${src}`] = {
          seconds: Math.round(proj),
          formatted: fmtTime(Math.round(proj)),
          source_time: fmtTime(best),
          source_distance: src,
        }
      })
    }
  })

  // Timeline
  const timeline = {}
  ;['10k', 'semi'].forEach(distType => {
    const sorted = [...(prs[distType] || [])].sort((a, b) => a.date.localeCompare(b.date))
    let runningBest = null
    sorted.forEach(r => {
      if (runningBest === null || r.time < runningBest) runningBest = r.time
      const d = r.date.slice(0, 10)
      if (!timeline[d]) timeline[d] = {}
      if (distType === '10k') {
        timeline[d].marathon_from_10k = Math.round(riegel(runningBest, 10000, 42195))
        timeline[d].semi_from_10k = Math.round(riegel(runningBest, 10000, 21097.5))
      } else {
        timeline[d].marathon_from_semi = Math.round(riegel(runningBest, 21097.5, 42195))
      }
    })
  })

  const now = new Date()
  const d90 = new Date(now - 90 * 86400000)
  const vol90 = activities.reduce((s, a) => parseDate(a.start_date_local) >= d90 ? s + a.distance : s, 0) / 1000

  return {
    current: projections,
    timeline: Object.entries(timeline).sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v })),
    confidence: vol90 > 300 ? 'high' : vol90 > 150 ? 'medium' : 'low',
    volume_90d_km: Math.round(vol90 * 10) / 10,
  }
}

// --- Analysis ---
export function computePaceStability(activities) {
  return activities
    .filter(a => (a.distance || 0) > 3000)
    .sort((a, b) => a.start_date_local.localeCompare(b.start_date_local))
    .slice(-100)
    .map(a => {
      const pace = a.moving_time / (a.distance / 1000)
      return {
        date: a.start_date_local,
        name: a.name || '',
        distance_km: Math.round(a.distance / 10) / 100,
        pace_s_km: Math.round(pace * 10) / 10,
        pace_formatted: fmtPace(pace),
        heartrate: a.average_heartrate,
      }
    })
}

export function computeCardiacDecoupling(activities) {
  return activities
    .filter(a => a.average_heartrate && (a.distance || 0) > 5000)
    .sort((a, b) => a.start_date_local.localeCompare(b.start_date_local))
    .slice(-200)
    .map(a => {
      const pace = a.moving_time / (a.distance / 1000)
      const speedKmh = (a.average_speed || 0) * 3.6
      const eff = a.average_heartrate ? speedKmh / a.average_heartrate : null
      return {
        date: a.start_date_local,
        name: a.name || '',
        pace_s_km: Math.round(pace * 10) / 10,
        avg_hr: a.average_heartrate,
        max_hr: a.max_heartrate,
        efficiency: eff ? Math.round(eff * 10000) / 10000 : null,
      }
    })
}

export function computeVolumeVsPerformance(activities) {
  const runs10k = activities
    .filter(a => matchDistance(a.distance || 0, '10k'))
    .sort((a, b) => a.start_date_local.localeCompare(b.start_date_local))

  return runs10k.map(r => {
    const d = r.start_date_local.slice(0, 10)
    const dt = new Date(d)
    const d30 = new Date(dt - 30 * 86400000).toISOString().slice(0, 10)
    const vol = activities.reduce((s, a) => {
      const ad = a.start_date_local.slice(0, 10)
      return ad >= d30 && ad <= d ? s + a.distance : s
    }, 0) / 1000
    return {
      date: d,
      time_10k: r.moving_time,
      formatted: fmtTime(r.moving_time),
      volume_30d_km: Math.round(vol * 10) / 10,
    }
  })
}

// --- Maps data ---
export function getRunsWithPolylines(activities, limit = 50) {
  return activities
    .filter(a => a.summary_polyline)
    .slice(0, limit)
    .map(a => ({
      id: a.id,
      name: a.name,
      date: a.start_date_local,
      distance: a.distance,
      moving_time: a.moving_time,
      polyline: a.summary_polyline,
      start_latlng: a.start_latlng,
      pace: a.distance > 0 ? fmtPace(a.moving_time / (a.distance / 1000)) : '-',
      distanceKm: Math.round(a.distance / 10) / 100,
    }))
}

export function getAllYears(activities) {
  const years = new Set()
  activities.forEach(a => years.add(String(parseDate(a.start_date_local).getFullYear())))
  return [...years].sort()
}
