import React from 'react'

export default function StatCard({ label, value, unit, trend, trendLabel }) {
  const trendColor = trend > 0 ? 'text-emerald-400' : trend < 0 ? 'text-red-400' : 'text-gray-500'

  return (
    <div className="card">
      <div className="stat-label">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="stat-value">{value}</span>
        {unit && <span className="text-sm text-gray-500">{unit}</span>}
      </div>
      {trend !== undefined && (
        <div className={`mt-2 text-xs ${trendColor}`}>
          {trend > 0 ? '+' : ''}{trend}% {trendLabel || ''}
        </div>
      )}
    </div>
  )
}
