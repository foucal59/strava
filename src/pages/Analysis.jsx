import React, { useMemo } from 'react'
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'
import { useActivities } from '../contexts/ActivityContext'
import { computePaceStability, computeCardiacDecoupling, computeVolumeVsPerformance, fmtPace, fmtTime } from '../lib/compute'
import ChartCard from '../components/ChartCard'
import Loader from '../components/Loader'

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
              <LineChart data={stab}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a25" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d?.slice(5,10)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtPace(v)} reversed domain={['dataMin-10','dataMax+10']} />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null; const d = payload[0]?.payload
                  return (<div className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-2">
                    <div className="text-xs text-gray-400">{d?.date?.slice(0,10)}</div>
                    <div className="text-sm text-white">{d?.name}</div>
                    <div className="text-sm text-strava">{fmtPace(d?.pace_s_km)}/km</div>
                    <div className="text-xs text-gray-400">{d?.distance_km} km</div>
                  </div>)
                }} />
                <Line dataKey="pace_s_km" stroke="#FC4C02" strokeWidth={1.5} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
        {card.filter(c => c.efficiency).length > 0 && (
          <ChartCard title="Indice d'efficacite" subtitle="Vitesse / FC (plus haut = meilleur)">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={card.filter(c => c.efficiency)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a25" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d?.slice(5,10)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null; const d = payload[0]?.payload
                  return (<div className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-2">
                    <div className="text-xs text-gray-400">{d?.date?.slice(0,10)}</div>
                    <div className="text-sm">Efficacite: {d?.efficiency?.toFixed(4)}</div>
                    <div className="text-xs text-gray-400">FC: {d?.avg_hr} | {fmtPace(d?.pace_s_km)}/km</div>
                  </div>)
                }} />
                <Line dataKey="efficiency" stroke="#10b981" strokeWidth={1.5} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
        {card.filter(c => c.avg_hr).length > 0 && (
          <ChartCard title="Decouplage cardiaque" subtitle="Allure vs FC">
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a25" />
                <XAxis dataKey="avg_hr" tick={{ fontSize: 10 }} />
                <YAxis dataKey="pace_s_km" tick={{ fontSize: 10 }} tickFormatter={v => fmtPace(v)} reversed />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null; const d = payload[0]?.payload
                  return (<div className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-2">
                    <div className="text-xs text-gray-400">{d?.date?.slice(0,10)}</div>
                    <div className="text-sm">{fmtPace(d?.pace_s_km)}/km @ {d?.avg_hr} bpm</div>
                  </div>)
                }} />
                <Scatter data={card.filter(c => c.avg_hr)} fill="#3b82f6" fillOpacity={0.6} />
              </ScatterChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
        {vp.length > 0 && (
          <ChartCard title="Volume 30j vs Performance 10k">
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a25" />
                <XAxis dataKey="volume_30d_km" tick={{ fontSize: 10 }} />
                <YAxis dataKey="time_10k" tick={{ fontSize: 10 }} tickFormatter={v => fmtTime(v)} reversed />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null; const d = payload[0]?.payload
                  return (<div className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-2">
                    <div className="text-xs text-gray-400">{d?.date}</div>
                    <div className="text-sm text-white">10k: {d?.formatted}</div>
                    <div className="text-xs text-gray-400">Vol 30j: {d?.volume_30d_km} km</div>
                  </div>)
                }} />
                <Scatter data={vp} fill="#f59e0b" fillOpacity={0.7} />
              </ScatterChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>
    </div>
  )
}
