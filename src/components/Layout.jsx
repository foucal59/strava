import React from 'react'
import { NavLink } from 'react-router-dom'
import { Activity, BarChart3, Trophy, Map, LineChart, LogOut, RefreshCw } from 'lucide-react'
import { useActivities } from '../contexts/ActivityContext'

const navItems = [
  { to: '/', icon: Activity, label: 'Cockpit' },
  { to: '/volume', icon: BarChart3, label: 'Volume' },
  { to: '/performance', icon: Trophy, label: 'Performance' },
  { to: '/segments', icon: Map, label: 'Segments' },
  { to: '/analysis', icon: LineChart, label: 'Analyse' },
]

function formatAgo(date) {
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "a l'instant"
  if (mins < 60) return `il y a ${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `il y a ${hours}h`
  return `il y a ${Math.floor(hours / 24)}j`
}

export default function Layout({ children, athlete, onLogout }) {
  const { syncing, refresh, cacheInfo } = useActivities()

  const lastSyncLabel = cacheInfo?.lastSync
    ? `${cacheInfo.count} runs | sync ${formatAgo(cacheInfo.lastSync)}`
    : 'Non synchronise'

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
            <button onClick={refresh} disabled={syncing}
              className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all duration-200 ${
                syncing ? 'bg-strava/10 text-strava' : 'bg-dark-700 text-gray-400 hover:text-white hover:bg-dark-600'}`}
              title="Forcer la synchronisation">
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              <span>{syncing ? 'Sync...' : lastSyncLabel}</span>
            </button>
            {athlete && (
              <div className="flex items-center gap-2">
                {athlete.profile_pic && <img src={athlete.profile_pic} alt="" className="w-7 h-7 rounded-full" />}
                <span className="text-sm text-gray-400">{athlete.firstname}</span>
              </div>
            )}
            {onLogout && (
              <button onClick={onLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-white bg-dark-700 hover:bg-dark-600 transition-colors">
                <LogOut size={14} />
              </button>
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
