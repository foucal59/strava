import React, { useMemo } from 'react'
import { useActivities } from '../contexts/ActivityContext'
import { computeCockpit, getRunsWithPolylines } from '../lib/compute'
import StatCard from '../components/StatCard'
import AlertBanner from '../components/AlertBanner'
import RunMap from '../components/RunMap'
import Loader from '../components/Loader'

export default function Cockpit() {
  const { activities, loading } = useActivities()

  const data = useMemo(() => {
    if (!activities.length) return null
    return computeCockpit(activities)
  }, [activities])

  const recentRuns = useMemo(() => getRunsWithPolylines(activities, 20), [activities])

  if (loading) return <Loader />
  if (!data) return <div className="text-gray-500">Aucune donnee disponible.</div>

  const projections = data.projections ? Object.entries(data.projections).map(([key, val]) => ({
    key, label: key.replace(/_/g, ' ').replace('from', 'via'),
    time: val.formatted,
    source: `${val.source_distance} en ${val.source_time}`,
    sourceDate: val.source_date,
  })) : []

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Cockpit</h2>
      <AlertBanner alerts={data.alerts} />
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-8">
        <StatCard label="Semaine en cours" value={data.week_volume} unit="km" />
        <StatCard label="90 jours glissants" value={data.volume_90d} unit="km" />
        <StatCard label="Moyenne 4 sem." value={data.avg_4_weeks} unit="km/sem" />
        <StatCard label="PR (90j)" value={data.pr_90d} />
        <StatCard label="Total runs" value={data.total_activities} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="card">
          <h3 className="text-sm font-medium text-gray-300 mb-4">Derniers parcours</h3>
          <RunMap runs={recentRuns} height={350} />
        </div>

        {projections.length > 0 && (
          <div className="card">
            <h3 className="text-sm font-medium text-gray-300 mb-4">Projections Riegel</h3>
            <div className="grid grid-cols-1 gap-3">
              {projections.map(p => (
                <div key={p.key} className="bg-dark-700 rounded-lg p-4">
                  <div className="text-xs text-gray-500 uppercase tracking-wider">{p.label}</div>
                  <div className="text-2xl font-mono font-semibold text-white mt-1">{p.time}</div>
                  <div className="text-xs text-gray-500 mt-1">Base: {p.source}{p.sourceDate ? ` (${p.sourceDate})` : ''}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
