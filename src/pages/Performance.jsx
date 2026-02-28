import React, { useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts'
import { useActivities } from '../contexts/ActivityContext'
import { computePRs, computeBestByYear, computeProjections, fmtTime } from '../lib/compute'
import ChartCard from '../components/ChartCard'
import RunMap from '../components/RunMap'
import Loader from '../components/Loader'

const DC = { '5k': '#FC4C02', '10k': '#3b82f6', 'semi': '#10b981', 'marathon': '#f59e0b' }
const DL = { '5k': '5 km', '10k': '10 km', 'semi': 'Semi-marathon', 'marathon': 'Marathon' }

function ft(s) {
  if (!s) return '-'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h > 0 ? `${h}h${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`
}

function PTip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className="backdrop-blur-xl bg-dark-800/90 border border-dark-500/50 rounded-xl px-4 py-3 shadow-2xl">
      <div className="text-xs text-gray-400 font-medium">{d?.date?.slice(0, 10)}</div>
      <div className="text-sm text-white font-mono mt-1">{d?.formatted}</div>
      {d?.pace && <div className="text-xs text-gray-400 mt-0.5">{d.pace}</div>}
    </div>
  )
}

const axisStyle = { fontSize: 10, fill: '#6b7280' }
const gridStyle = { strokeDasharray: '3 3', stroke: '#1a1a25', strokeOpacity: 0.6 }

export default function Performance() {
  const { activities, loading } = useActivities()

  const records = useMemo(() => computePRs(activities), [activities])
  const bestByYear = useMemo(() => computeBestByYear(records), [records])
  const projData = useMemo(() => computeProjections(records, activities), [records, activities])

  // Sort records chronologically for charts (oldest to newest = left to right)
  const recordsChrono = useMemo(() => {
    const result = {}
    Object.entries(records).forEach(([dt, recs]) => {
      result[dt] = [...recs].sort((a, b) => a.date.localeCompare(b.date))
    })
    return result
  }, [records])

  const prMapRuns = useMemo(() => {
    const runs = []
    Object.entries(records).forEach(([dt, recs]) => {
      const best = recs.find(r => r.isBest)
      if (best?.polyline) {
        runs.push({
          id: best.activity_id,
          name: `PR ${DL[dt]} - ${best.formatted}`,
          date: best.date,
          distance: best.distance,
          polyline: best.polyline,
          distanceKm: Math.round(best.distance / 10) / 100,
          pace: best.pace,
        })
      }
    })
    return runs
  }, [records])

  if (loading) return <Loader />

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Performance & Records</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {Object.entries(DL).map(([k, l]) => {
          const best = records[k]?.find(r => r.isBest)
          return (
            <div key={k} className="card group">
              <div className="text-xs text-gray-500 uppercase tracking-wider">{l}</div>
              <div className="text-2xl font-mono font-semibold text-white mt-1">{best ? best.formatted : '-'}</div>
              {best && <div className="text-xs text-gray-500 mt-1">{best.pace} | {best.date?.slice(0,10)}</div>}
              <div className="h-0.5 mt-3 rounded-full transition-all duration-300 group-hover:w-full w-0" style={{ backgroundColor: DC[k] }} />
            </div>
          )
        })}
      </div>

      {prMapRuns.length > 0 && (
        <div className="card mb-6">
          <h3 className="text-sm font-medium text-gray-300 mb-4">Parcours des records personnels</h3>
          <RunMap runs={prMapRuns} height={300} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Object.entries(recordsChrono).map(([dt, runs]) => runs.length > 0 && (
          <ChartCard key={dt} title={`Evolution ${DL[dt] || dt}`}>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={runs}>
                <defs>
                  <linearGradient id={`gradPerf_${dt}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={DC[dt]} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={DC[dt]} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey="date" tick={axisStyle} tickFormatter={d => d?.slice(0, 10)} />
                <YAxis tick={axisStyle} tickFormatter={ft} domain={['dataMin - 60', 'dataMax + 60']} reversed />
                <Tooltip content={<PTip />} />
                <Area type="monotone" dataKey="time" stroke={DC[dt]} strokeWidth={2} fill={`url(#gradPerf_${dt})`} dot={{ r: 3, fill: DC[dt], strokeWidth: 0 }} animationDuration={1000} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        ))}
        {Object.entries(bestByYear).map(([dt, years]) => years.length > 0 && (
          <ChartCard key={`y-${dt}`} title={`Meilleur temps annuel ${DL[dt] || dt}`}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={years}>
                <defs>
                  <linearGradient id={`gradBar_${dt}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={DC[dt]} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={DC[dt]} stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey="year" tick={{ ...axisStyle, fontSize: 11 }} />
                <YAxis tick={axisStyle} tickFormatter={ft} reversed />
                <Tooltip content={<PTip />} />
                <Bar dataKey="time" radius={[6, 6, 0, 0]} animationDuration={800}>
                  {years.map((_, i) => <Cell key={i} fill={`url(#gradBar_${dt})`} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        ))}
        {projData?.timeline?.length > 0 && (
          <ChartCard title="Projection Marathon" subtitle={`Confiance: ${projData.confidence} (${projData.volume_90d_km} km/90j)`} className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={projData.timeline}>
                <defs>
                  <linearGradient id="gradProj10k" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradProjSemi" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey="date" tick={axisStyle} tickFormatter={d => d?.slice(0, 10)} />
                <YAxis tick={axisStyle} tickFormatter={ft} reversed />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0]?.payload
                  return (
                    <div className="backdrop-blur-xl bg-dark-800/90 border border-dark-500/50 rounded-xl px-4 py-3 shadow-2xl">
                      <div className="text-xs text-gray-400 font-medium">{d?.date}</div>
                      {d?.marathon_from_10k && <div className="text-sm text-blue-400 font-mono mt-1">Via 10k: {ft(d.marathon_from_10k)}</div>}
                      {d?.marathon_from_semi && <div className="text-sm text-emerald-400 font-mono">Via semi: {ft(d.marathon_from_semi)}</div>}
                    </div>
                  )
                }} />
                <Area type="monotone" dataKey="marathon_from_10k" stroke="#3b82f6" strokeWidth={2} fill="url(#gradProj10k)" dot={false} name="Via 10k" animationDuration={1200} />
                <Area type="monotone" dataKey="marathon_from_semi" stroke="#10b981" strokeWidth={2} fill="url(#gradProjSemi)" dot={false} name="Via semi" animationDuration={1200} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>
    </div>
  )
}
