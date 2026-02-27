import React from 'react'
import { api } from '../api'
import { useAPI } from '../hooks/useAPI'
import StatCard from '../components/StatCard'
import AlertBanner from '../components/AlertBanner'
import Loader from '../components/Loader'

function formatProjection(proj) {
  if (!proj) return []
  return Object.entries(proj).map(([key, val]) => ({
    key,
    label: key.replace(/_/g, ' ').replace('from', 'via'),
    time: val.formatted,
    source: `${val.source_distance} en ${val.source_time}`,
  }))
}

export default function Cockpit() {
  const { data, loading } = useAPI(() => api.cockpit())

  if (loading) return <Loader />
  if (!data) return <div className="text-gray-500">Aucune donnee disponible. Lancez un sync.</div>

  const projections = formatProjection(data.projections)

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Cockpit</h2>

      <AlertBanner alerts={data.alerts} />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
        <StatCard label="Semaine en cours" value={data.week_volume} unit="km" />
        <StatCard label="90 jours glissants" value={data.volume_90d} unit="km" />
        <StatCard label="Moyenne 4 sem." value={data.avg_4_weeks} unit="km/sem" />
        <StatCard label="Local Legends" value={data.local_legends} />
        <StatCard label="PR (90j)" value={data.pr_90d} />
        <StatCard label="Confiance" value="-" />
      </div>

      {projections.length > 0 && (
        <div className="card mb-6">
          <h3 className="text-sm font-medium text-gray-300 mb-4">Projections Riegel</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {projections.map(p => (
              <div key={p.key} className="bg-dark-700 rounded-lg p-4">
                <div className="text-xs text-gray-500 uppercase tracking-wider">{p.label}</div>
                <div className="text-2xl font-mono font-semibold text-white mt-1">{p.time}</div>
                <div className="text-xs text-gray-500 mt-1">Base: {p.source}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
