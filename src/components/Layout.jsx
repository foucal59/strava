import React, { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Activity, BarChart3, Trophy, Map, LineChart, RefreshCw } from 'lucide-react'
import { api } from '../api'

const navItems = [
  { to: '/', icon: Activity, label: 'Cockpit' },
  { to: '/volume', icon: BarChart3, label: 'Volume' },
  { to: '/performance', icon: Trophy, label: 'Performance' },
  { to: '/segments', icon: Map, label: 'Segments' },
  { to: '/analysis', icon: LineChart, label: 'Analyse' },
]

export default function Layout({ children, athlete }) {
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)

  const handleSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const r = await api.triggerSync()
      setSyncResult(r)
      setTimeout(() => window.location.reload(), 1500)
    } catch (e) {
      setSyncResult({ error: e.message })
    }
    setSyncing(false)
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-dark-600 bg-dark-800/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="text-lg font-semibold tracking-tight">
              <span className="text-strava">S</span>trava Dashboard
            </h1>
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map(({ to, icon: Icon, label }) => (
                <NavLink key={to} to={to} end={to === '/'}
                  className={({ isActive }) => `nav-link flex items-center gap-2 ${isActive ? 'active' : ''}`}>
                  <Icon size={16} />{label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={handleSync} disabled={syncing}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-dark-700 hover:bg-dark-600 transition-colors disabled:opacity-50">
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Sync...' : 'Sync'}
            </button>
            {syncResult && !syncResult.error && (
              <span className="text-xs text-emerald-400">{syncResult.activities_synced} activites</span>
            )}
            {athlete && (
              <div className="flex items-center gap-2">
                {athlete.profile_pic && <img src={athlete.profile_pic} alt="" className="w-7 h-7 rounded-full" />}
                <span className="text-sm text-gray-400">{athlete.firstname}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <nav className="md:hidden flex items-center gap-1 px-4 py-2 border-b border-dark-600 bg-dark-800 overflow-x-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'}
            className={({ isActive }) => `nav-link flex items-center gap-1.5 whitespace-nowrap ${isActive ? 'active' : ''}`}>
            <Icon size={14} />{label}
          </NavLink>
        ))}
      </nav>

      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-6 py-6">
        {children}
      </main>
    </div>
  )
}
