import React, { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts'
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
    <div className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 shadow-xl">
      <div className="text-xs text-gray-400">{d?.date?.slice(0, 10)}</div>
      <div className="text-sm text-white">{d?.formatted}</div>
      {d?.pace && <div className="text-xs text-gray-400">{d.pace}</div>}
    </div>
  )
}

export default function Performance() {
  const { activities, loading } = useActivities()

  const records = useMemo(() => computePRs(activities), [activities])
  const bestByYear = useMemo(() => computeBestByYear(records), [records])
  const projData = useMemo(() => computeProjections(records, activities), [records, activities])

  // Get polyline for best PR of each distance
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
            <div key={k} className="card">
              <div className="text-xs text-gray-500 uppercase tracking-wider">{l}</div>
              <div className="text-2xl font-mono font-semibold text-white mt-1">{best ? best.formatted : '-'}</div>
              {best && <div className="text-xs text-gray-500 mt-1">{best.pace} | {best.date?.slice(0,10)}</div>}
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
        {Object.entries(records).map(([dt, runs]) => runs.length > 0 && (
          <ChartCard key={dt} title={`Evolution ${DL[dt] || dt}`}>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={runs}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a25" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d?.slice(0, 10)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={ft} domain={['dataMin - 60', 'dataMax + 60']} reversed />
                <Tooltip content={<PTip />} />
                <Line dataKey="time" stroke={DC[dt] || '#FC4C02'} strokeWidth={2} dot={{ r: 3, fill: DC[dt] }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        ))}
        {Object.entries(bestByYear).map(([dt, years]) => years.length > 0 && (
          <ChartCard key={`y-${dt}`} title={`Meilleur temps annuel ${DL[dt] || dt}`}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={years}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a25" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={ft} reversed />
                <Tooltip content={<PTip />} />
                <Bar dataKey="time" radius={[4, 4, 0, 0]}>
                  {years.map((_, i) => <Cell key={i} fill={DC[dt] || '#FC4C02'} fillOpacity={0.8} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        ))}
        {projData?.timeline?.length > 0 && (
          <ChartCard title="Projection Marathon" subtitle={`Confiance: ${projData.confidence} (${projData.volume_90d_km} km/90j)`} className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={projData.timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a25" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d?.slice(0, 10)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={ft} reversed />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0]?.payload
                  return (
                    <div className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 shadow-xl">
                      <div className="text-xs text-gray-400">{d?.date}</div>
                      {d?.marathon_from_10k && <div className="text-sm text-blue-400">Via 10k: {ft(d.marathon_from_10k)}</div>}
                      {d?.marathon_from_semi && <div className="text-sm text-emerald-400">Via semi: {ft(d.marathon_from_semi)}</div>}
                    </div>
                  )
                }} />
                <Line dataKey="marathon_from_10k" stroke="#3b82f6" strokeWidth={2} dot={false} name="Via 10k" />
                <Line dataKey="marathon_from_semi" stroke="#10b981" strokeWidth={2} dot={false} name="Via semi" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>
    </div>
  )
}
