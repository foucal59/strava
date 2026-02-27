import React from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts'
import { api } from '../api'
import { useAPI } from '../hooks/useAPI'
import ChartCard from '../components/ChartCard'
import Loader from '../components/Loader'

const DIST_COLORS = { '5k': '#FC4C02', '10k': '#3b82f6', 'semi': '#10b981', 'marathon': '#f59e0b' }
const DIST_LABELS = { '5k': '5 km', '10k': '10 km', 'semi': 'Semi-marathon', 'marathon': 'Marathon' }

function fmtTime(s) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

function PaceTooltip({ active, payload }) {
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
  const { data: records, loading: rLoad } = useAPI(() => api.records())
  const { data: bestByYear, loading: bLoad } = useAPI(() => api.bestByYear())
  const { data: projData, loading: pLoad } = useAPI(() => api.projections())

  if (rLoad) return <Loader />

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Performance & Records</h2>

      {/* Best times summary */}
      {records && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {Object.entries(DIST_LABELS).map(([key, label]) => {
            const best = records[key]?.find(r => r.is_best)
            return (
              <div key={key} className="card">
                <div className="text-xs text-gray-500 uppercase tracking-wider">{label}</div>
                <div className="text-2xl font-mono font-semibold text-white mt-1">
                  {best ? best.formatted : '-'}
                </div>
                {best && <div className="text-xs text-gray-500 mt-1">{best.pace} | {best.date?.slice(0, 10)}</div>}
              </div>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Evolution par distance */}
        {records && Object.entries(records).map(([distType, runs]) => (
          <ChartCard key={distType} title={`Evolution ${DIST_LABELS[distType] || distType}`} subtitle="Temps par course">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={runs}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a25" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d?.slice(0, 10)} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={fmtTime}
                  domain={['dataMin - 60', 'dataMax + 60']}
                  reversed
                />
                <Tooltip content={<PaceTooltip />} />
                <Line
                  dataKey="time"
                  stroke={DIST_COLORS[distType] || '#FC4C02'}
                  strokeWidth={2}
                  dot={{ r: 3, fill: DIST_COLORS[distType] }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        ))}

        {/* Meilleure allure annuelle */}
        {bestByYear && Object.entries(bestByYear).map(([distType, years]) => (
          <ChartCard key={`year-${distType}`} title={`Meilleur temps annuel ${DIST_LABELS[distType] || distType}`}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={years}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a25" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtTime} reversed />
                <Tooltip content={<PaceTooltip />} />
                <Bar dataKey="time" radius={[4, 4, 0, 0]}>
                  {years.map((_, i) => (
                    <Cell key={i} fill={DIST_COLORS[distType] || '#FC4C02'} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        ))}

        {/* Projection timeline */}
        {projData?.timeline?.length > 0 && (
          <ChartCard title="Projection Marathon dans le temps" subtitle={`Confiance: ${projData.confidence} (${projData.volume_90d_km} km/90j)`} className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={projData.timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a25" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d?.slice(0, 10)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtTime} reversed />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0]?.payload
                    return (
                      <div className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 shadow-xl">
                        <div className="text-xs text-gray-400">{d?.date}</div>
                        {d?.marathon_from_10k && <div className="text-sm text-blue-400">Via 10k: {fmtTime(d.marathon_from_10k)}</div>}
                        {d?.marathon_from_semi && <div className="text-sm text-emerald-400">Via semi: {fmtTime(d.marathon_from_semi)}</div>}
                      </div>
                    )
                  }}
                />
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
