import React, { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line
} from 'recharts'
import { api } from '../api'
import { useAPI } from '../hooks/useAPI'
import ChartCard from '../components/ChartCard'
import Loader from '../components/Loader'

function fmtTime(s) {
  if (!s) return '-'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

export default function Segments() {
  const { data: legends, loading: llLoad } = useAPI(() => api.localLegends())
  const { data: prs, loading: prLoad } = useAPI(() => api.segmentPRs())
  const [selectedSeg, setSelectedSeg] = useState(null)

  if (llLoad && prLoad) return <Loader />

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Segments & Autorite Locale</h2>

      {/* Current Local Legends */}
      {legends && (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-sm font-medium text-gray-300">Local Legends actives</h3>
            <span className="badge badge-strava">{legends.total}</span>
          </div>
          {legends.current.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {legends.current.map(ll => (
                <div key={ll.segment_id} className="bg-dark-700 rounded-lg px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-gray-200">{ll.name}</span>
                  <span className="text-xs text-gray-500">{ll.effort_count} efforts</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Aucune Local Legend active. Lancez un snapshot quotidien.</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PR par mois */}
        {prs?.monthly_prs && (
          <ChartCard title="PR segments par mois">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={prs.monthly_prs}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a25" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    return (
                      <div className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-2">
                        <div className="text-sm text-white">{payload[0]?.payload?.month}</div>
                        <div className="text-sm text-strava">{payload[0]?.value} PR</div>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="prs" fill="#FC4C02" fillOpacity={0.8} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Top segments */}
        {prs?.top_segments && (
          <ChartCard title="Segments les plus courus" subtitle="Top 20 par nombre d'efforts">
            <div className="max-h-64 overflow-y-auto space-y-1">
              {prs.top_segments.map(seg => (
                <button
                  key={seg.segment_id}
                  onClick={() => setSelectedSeg(seg.segment_id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded text-sm transition-colors ${
                    selectedSeg === seg.segment_id
                      ? 'bg-strava/20 text-strava'
                      : 'hover:bg-dark-600 text-gray-300'
                  }`}
                >
                  <span className="truncate mr-4">{seg.name}</span>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <span className="text-xs text-gray-500">{seg.efforts} efforts</span>
                    <span className="font-mono text-xs">{fmtTime(seg.best_time)}</span>
                  </div>
                </button>
              ))}
            </div>
          </ChartCard>
        )}

        {/* Progression on selected segment */}
        {selectedSeg && prs?.progression?.[selectedSeg] && (
          <ChartCard
            title={`Progression: ${prs.progression[selectedSeg].name}`}
            subtitle={`Meilleur temps: ${fmtTime(prs.progression[selectedSeg].best)}`}
            className="lg:col-span-2"
          >
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={prs.progression[selectedSeg].efforts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a25" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d?.slice(0, 10)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtTime} reversed />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0]?.payload
                    return (
                      <div className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-2">
                        <div className="text-xs text-gray-400">{d?.date?.slice(0, 10)}</div>
                        <div className="text-sm text-white">{fmtTime(d?.elapsed_time)}</div>
                        {d?.pr_rank === 1 && <div className="text-xs text-strava">PR!</div>}
                      </div>
                    )
                  }}
                />
                <Line
                  dataKey="elapsed_time"
                  stroke="#FC4C02"
                  strokeWidth={2}
                  dot={(props) => {
                    const { cx, cy, payload } = props
                    if (payload.pr_rank === 1) {
                      return <circle cx={cx} cy={cy} r={4} fill="#FC4C02" stroke="#fff" strokeWidth={1} />
                    }
                    return <circle cx={cx} cy={cy} r={2} fill="#FC4C02" fillOpacity={0.5} />
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Local Legend timeline */}
        {legends?.timeline && Object.keys(legends.timeline).length > 0 && (
          <ChartCard title="Timeline Local Legends" subtitle="Periodes de possession" className="lg:col-span-2">
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {Object.entries(legends.timeline).map(([segId, seg]) => (
                <div key={segId} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-40 truncate flex-shrink-0">{seg.name}</span>
                  <div className="flex-1 h-5 bg-dark-700 rounded relative overflow-hidden">
                    {seg.periods.map((p, i) => {
                      const isActive = !p.end
                      return (
                        <div
                          key={i}
                          className={`absolute h-full rounded ${isActive ? 'bg-strava' : 'bg-strava/40'}`}
                          title={`${p.start} - ${p.end || 'actif'}`}
                          style={{
                            left: '0%', // Simplified; real implementation would use date-based positioning
                            width: isActive ? '100%' : '60%',
                          }}
                        />
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>
        )}
      </div>
    </div>
  )
}
