import React, { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'
import { api } from '../api'
import { useAPI } from '../hooks/useAPI'
import ChartCard from '../components/ChartCard'
import Loader from '../components/Loader'

const axisStyle = { fontSize: 10, fill: '#6b7280' }
const gridStyle = { strokeDasharray: '3 3', stroke: '#1a1a25', strokeOpacity: 0.6 }

function ft(s) {
  if (!s) return '-'
  const m = Math.floor(s / 60), sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

export default function Segments() {
  const { data: legends, loading: llL } = useAPI(() => api.localLegends())
  const { data: prs, loading: prL } = useAPI(() => api.segmentPRs())
  const [sel, setSel] = useState(null)

  if (llL && prL) return <Loader />

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Segments & Autorite Locale</h2>
      {legends && (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-sm font-medium text-gray-300">Local Legends actives</h3>
            <span className="badge badge-strava">{legends.total}</span>
          </div>
          {legends.current.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {legends.current.map(ll => (
                <div key={ll.segment_id} className="bg-dark-700/50 backdrop-blur-sm rounded-xl px-4 py-3 flex items-center justify-between border border-dark-600/30 hover:border-dark-500/50 transition-all duration-200">
                  <span className="text-sm text-gray-200">{ll.name}</span>
                  <span className="text-xs text-gray-500 font-mono">{ll.effort_count} efforts</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Aucune Local Legend. Lancez un sync + snapshot.</p>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {prs?.monthly_prs && (
          <ChartCard title="PR segments par mois">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={prs.monthly_prs}>
                <defs>
                  <linearGradient id="gradSegPR" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FC4C02" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#FC4C02" stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey="month" tick={axisStyle} />
                <YAxis tick={{ ...axisStyle, fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  return (
                    <div className="backdrop-blur-xl bg-dark-800/90 border border-dark-500/50 rounded-xl px-4 py-3 shadow-2xl">
                      <div className="text-sm text-white font-medium">{payload[0]?.payload?.month}</div>
                      <div className="text-sm font-mono" style={{color:'#FC4C02'}}>{payload[0]?.value} PR</div>
                    </div>
                  )
                }} />
                <Bar dataKey="prs" fill="url(#gradSegPR)" radius={[6, 6, 0, 0]} animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
        {prs?.top_segments && (
          <ChartCard title="Segments les plus courus" subtitle="Top 20">
            <div className="max-h-64 overflow-y-auto space-y-1">
              {prs.top_segments.map(seg => (
                <button key={seg.segment_id} onClick={() => setSel(seg.segment_id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                    sel === seg.segment_id ? 'bg-strava/15 text-strava border border-strava/20' : 'hover:bg-dark-600/50 text-gray-300 border border-transparent'}`}>
                  <span className="truncate mr-4">{seg.name}</span>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <span className="text-xs text-gray-500">{seg.efforts} efforts</span>
                    <span className="font-mono text-xs">{ft(seg.best_time)}</span>
                  </div>
                </button>
              ))}
            </div>
          </ChartCard>
        )}
        {sel && prs?.progression?.[sel] && (
          <ChartCard title={`Progression: ${prs.progression[sel].name}`}
            subtitle={`Meilleur: ${ft(prs.progression[sel].best)}`} className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={prs.progression[sel].efforts}>
                <defs>
                  <linearGradient id="gradSegProg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FC4C02" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#FC4C02" stopOpacity={0.02} />
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
                      <div className="text-xs text-gray-400 font-medium">{d?.date?.slice(0, 10)}</div>
                      <div className="text-sm text-white font-mono">{ft(d?.elapsed_time)}</div>
                      {d?.pr_rank === 1 && <div className="text-xs font-medium" style={{color:'#FC4C02'}}>PR!</div>}
                    </div>
                  )
                }} />
                <Area type="monotone" dataKey="elapsed_time" stroke="#FC4C02" strokeWidth={2} fill="url(#gradSegProg)"
                  dot={props => {
                    const { cx, cy, payload } = props
                    return payload.pr_rank === 1
                      ? <circle cx={cx} cy={cy} r={5} fill="#FC4C02" stroke="#fff" strokeWidth={1.5} />
                      : <circle cx={cx} cy={cy} r={2} fill="#FC4C02" fillOpacity={0.5} />
                  }} animationDuration={1000} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>
    </div>
  )
}
