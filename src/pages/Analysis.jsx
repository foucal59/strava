import React, { useMemo } from 'react'
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'
import { useActivities } from '../contexts/ActivityContext'
import { computePaceStability, computeCardiacDecoupling, computeVolumeVsPerformance, fmtPace, fmtTime } from '../lib/compute'
import ChartCard from '../components/ChartCard'
import Loader from '../components/Loader'

const axisStyle = { fontSize: 10, fill: '#6b7280' }
const gridStyle = { strokeDasharray: '3 3', stroke: '#1a1a25', strokeOpacity: 0.6 }

export default function Analysis() {
  const { activities, loading } = useActivities()

  const stab = useMemo(() => computePaceStability(activities), [activities])
  const card = useMemo(() => computeCardiacDecoupling(activities), [activities])
  const vp = useMemo(() => computeVolumeVsPerformance(activities), [activities])

  if (loading) return <Loader />

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Analyse avancee</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {stab.length > 0 && (
          <ChartCard title="Stabilite d'allure" subtitle="100 derniers runs">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={stab}>
                <defs>
                  <linearGradient id="gradPace" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FC4C02" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#FC4C02" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey="date" tick={axisStyle} tickFormatter={d => d?.slice(5,10)} />
                <YAxis tick={axisStyle} tickFormatter={v => fmtPace(v)} reversed domain={['dataMin-10','dataMax+10']} />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null; const d = payload[0]?.payload
                  return (<div className="backdrop-blur-xl bg-dark-800/90 border border-dark-500/50 rounded-xl px-4 py-3 shadow-2xl">
                    <div className="text-xs text-gray-400 font-medium">{d?.date?.slice(0,10)}</div>
                    <div className="text-sm text-white">{d?.name}</div>
                    <div className="text-sm font-mono" style={{color:'#FC4C02'}}>{fmtPace(d?.pace_s_km)}/km</div>
                    <div className="text-xs text-gray-400">{d?.distance_km} km</div>
                  </div>)
                }} />
                <Area type="monotone" dataKey="pace_s_km" stroke="#FC4C02" strokeWidth={2} fill="url(#gradPace)" dot={{ r: 2, fill: '#FC4C02', strokeWidth: 0 }} animationDuration={1000} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
        {card.filter(c => c.efficiency).length > 0 && (
          <ChartCard title="Indice d'efficacite" subtitle="Vitesse / FC (plus haut = meilleur)">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={card.filter(c => c.efficiency)}>
                <defs>
                  <linearGradient id="gradEff" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey="date" tick={axisStyle} tickFormatter={d => d?.slice(5,10)} />
                <YAxis tick={axisStyle} />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null; const d = payload[0]?.payload
                  return (<div className="backdrop-blur-xl bg-dark-800/90 border border-dark-500/50 rounded-xl px-4 py-3 shadow-2xl">
                    <div className="text-xs text-gray-400 font-medium">{d?.date?.slice(0,10)}</div>
                    <div className="text-sm font-mono text-emerald-400">Efficacite: {d?.efficiency?.toFixed(4)}</div>
                    <div className="text-xs text-gray-400">FC: {d?.avg_hr} | {fmtPace(d?.pace_s_km)}/km</div>
                  </div>)
                }} />
                <Area type="monotone" dataKey="efficiency" stroke="#10b981" strokeWidth={2} fill="url(#gradEff)" dot={{ r: 2, fill: '#10b981', strokeWidth: 0 }} animationDuration={1000} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
        {card.filter(c => c.avg_hr).length > 0 && (
          <ChartCard title="Decouplage cardiaque" subtitle="Allure vs FC">
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey="avg_hr" tick={axisStyle} name="FC moy." unit=" bpm" />
                <YAxis dataKey="pace_s_km" tick={axisStyle} tickFormatter={v => fmtPace(v)} reversed name="Allure" />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null; const d = payload[0]?.payload
                  return (<div className="backdrop-blur-xl bg-dark-800/90 border border-dark-500/50 rounded-xl px-4 py-3 shadow-2xl">
                    <div className="text-xs text-gray-400 font-medium">{d?.date?.slice(0,10)}</div>
                    <div className="text-sm font-mono text-blue-400">{fmtPace(d?.pace_s_km)}/km @ {d?.avg_hr} bpm</div>
                  </div>)
                }} />
                <Scatter data={card.filter(c => c.avg_hr)} fill="#3b82f6" fillOpacity={0.5} animationDuration={800} />
              </ScatterChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
        {vp.length > 0 && (
          <ChartCard title="Volume 30j vs Performance 10k">
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey="volume_30d_km" tick={axisStyle} name="Vol. 30j" unit=" km" />
                <YAxis dataKey="time_10k" tick={axisStyle} tickFormatter={v => fmtTime(v)} reversed name="Temps 10k" />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null; const d = payload[0]?.payload
                  return (<div className="backdrop-blur-xl bg-dark-800/90 border border-dark-500/50 rounded-xl px-4 py-3 shadow-2xl">
                    <div className="text-xs text-gray-400 font-medium">{d?.date}</div>
                    <div className="text-sm text-white font-mono">10k: {d?.formatted}</div>
                    <div className="text-xs text-gray-400">Vol 30j: {d?.volume_30d_km} km</div>
                  </div>)
                }} />
                <Scatter data={vp} fill="#f59e0b" fillOpacity={0.6} animationDuration={800} />
              </ScatterChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>
    </div>
  )
}
