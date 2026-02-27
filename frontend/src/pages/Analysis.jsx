import React from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line
} from 'recharts'
import { api } from '../api'
import { useAPI } from '../hooks/useAPI'
import ChartCard from '../components/ChartCard'
import Loader from '../components/Loader'

function fmtPace(s) {
  if (!s) return '-'
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

function fmtTime(s) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

export default function Analysis() {
  const { data: stability, loading: sLoad } = useAPI(() => api.paceStability())
  const { data: cardiac, loading: cLoad } = useAPI(() => api.cardiacDecoupling())
  const { data: volPerf, loading: vLoad } = useAPI(() => api.volumeVsPerformance())

  if (sLoad && cLoad && vLoad) return <Loader />

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Analyse avancee</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pace stability */}
        {stability && (
          <ChartCard title="Stabilite d'allure" subtitle="Allure par sortie (derniers 100 runs)">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={stability}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a25" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d?.slice(5, 10)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtPace} reversed domain={['dataMin - 10', 'dataMax + 10']} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0]?.payload
                    return (
                      <div className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-2">
                        <div className="text-xs text-gray-400">{d?.date?.slice(0, 10)}</div>
                        <div className="text-sm text-white">{d?.name}</div>
                        <div className="text-sm text-strava">{d?.pace_formatted}/km</div>
                        <div className="text-xs text-gray-400">{d?.distance_km} km</div>
                      </div>
                    )
                  }}
                />
                <Line dataKey="pace_s_km" stroke="#FC4C02" strokeWidth={1.5} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Cardiac efficiency */}
        {cardiac && cardiac.filter(c => c.efficiency).length > 0 && (
          <ChartCard title="Indice d'efficacite" subtitle="Vitesse / FC moyenne (plus haut = meilleur)">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={cardiac.filter(c => c.efficiency)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a25" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d?.slice(5, 10)} />
                <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0]?.payload
                    return (
                      <div className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-2">
                        <div className="text-xs text-gray-400">{d?.date?.slice(0, 10)}</div>
                        <div className="text-sm text-white">{d?.name}</div>
                        <div className="text-sm">Efficacite: {d?.efficiency?.toFixed(4)}</div>
                        <div className="text-xs text-gray-400">FC moy: {d?.avg_hr} | Allure: {fmtPace(d?.pace_s_km)}/km</div>
                      </div>
                    )
                  }}
                />
                <Line dataKey="efficiency" stroke="#10b981" strokeWidth={1.5} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Cardiac decoupling scatter */}
        {cardiac && cardiac.filter(c => c.avg_hr).length > 0 && (
          <ChartCard title="Decouplage cardiaque" subtitle="Allure vs FC moyenne">
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a25" />
                <XAxis dataKey="avg_hr" name="FC moy" tick={{ fontSize: 10 }} label={{ value: 'FC moy (bpm)', position: 'insideBottom', offset: -5, fontSize: 10 }} />
                <YAxis dataKey="pace_s_km" name="Allure" tick={{ fontSize: 10 }} tickFormatter={fmtPace} reversed />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0]?.payload
                    return (
                      <div className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-2">
                        <div className="text-xs text-gray-400">{d?.date?.slice(0, 10)}</div>
                        <div className="text-sm">{fmtPace(d?.pace_s_km)}/km @ {d?.avg_hr} bpm</div>
                      </div>
                    )
                  }}
                />
                <Scatter data={cardiac.filter(c => c.avg_hr)} fill="#3b82f6" fillOpacity={0.6} />
              </ScatterChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Volume vs 10k performance */}
        {volPerf && volPerf.length > 0 && (
          <ChartCard title="Volume 30j vs Performance 10k" subtitle="Correlation charge / resultat">
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a25" />
                <XAxis dataKey="volume_30d_km" name="Vol 30j" tick={{ fontSize: 10 }} label={{ value: 'km (30j)', position: 'insideBottom', offset: -5, fontSize: 10 }} />
                <YAxis dataKey="time_10k" name="Temps 10k" tick={{ fontSize: 10 }} tickFormatter={fmtTime} reversed />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0]?.payload
                    return (
                      <div className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-2">
                        <div className="text-xs text-gray-400">{d?.date}</div>
                        <div className="text-sm text-white">10k: {d?.formatted}</div>
                        <div className="text-xs text-gray-400">Volume 30j: {d?.volume_30d_km} km</div>
                      </div>
                    )
                  }}
                />
                <Scatter data={volPerf} fill="#f59e0b" fillOpacity={0.7} />
              </ScatterChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>
    </div>
  )
}
