import React from 'react'
import { AlertTriangle, AlertCircle, Info } from 'lucide-react'

const icons = {
  warning: AlertTriangle,
  danger: AlertCircle,
  info: Info,
}

const colors = {
  warning: 'border-amber-500/30 bg-amber-500/5 text-amber-400',
  danger: 'border-red-500/30 bg-red-500/5 text-red-400',
  info: 'border-blue-500/30 bg-blue-500/5 text-blue-400',
}

export default function AlertBanner({ alerts = [] }) {
  if (!alerts.length) return null

  return (
    <div className="space-y-2 mb-6">
      {alerts.map((a, i) => {
        const Icon = icons[a.type] || Info
        return (
          <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${colors[a.type] || colors.info}`}>
            <Icon size={16} className="flex-shrink-0" />
            <span className="text-sm">{a.message}</span>
          </div>
        )
      })}
    </div>
  )
}
