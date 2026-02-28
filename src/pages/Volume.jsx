import React, { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, ComposedChart, Line
} from 'recharts'
import { useActivities } from '../contexts/ActivityContext'
import { computeWeekly, computeMonthly, computeYearly, computeRolling, getAllYears } from '../lib/compute'
import ChartCard from '../components/ChartCard'
import Loader from '../components/Loader'

const COLORS = ['#FC4C02', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6']

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="backdrop-blur-xl bg-dark-800/90 border border-dark-500/50 rounded-xl px-4 py-3 shadow-2xl">
      <div className="text-xs text-gray-400 mb-1.5 font-medium">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="text-sm font-mono" style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value} km
        </div>
      ))}
    </div>
  )
}

const axisStyle = { fontSize: 11, fill: '#6b7280' }
const gridStyle = { strokeDasharray: '3 3', stroke: '#1a1a25', strokeOpacity: 0.6 }

export default function Volume() {
  const { activities, loading } = useActivities()
  const yr = new Date().getFullYear()
  const [selYears, setSelYears] = useState([yr.toString()])

  const avYears = useMemo(() => getAllYears(activities), [activities])
  const weekly = useMemo(() => computeWeekly(activities, selYears), [activities, selYears])
  const monthly = useMemo(() => computeMonthly(activities), [activities])
  const yearly = useMemo(() => computeYearly(activities), [activities])
  const rolling = useMemo(() => computeRolling(activities, 90), [activities])

  const toggle = (y) => setSelYears(p => p.includes(y) ? p.filter(x => x !== y) : [...p, y])

  const weeklyByYear = useMemo(() => {
    const map = {}
    weekly.forEach(w => {
      const wk = parseInt(w.week)
      if (!map[wk]) map[wk] = { week: wk }
      map[wk][w.year] = w.km
      map[wk][`${w.year}_ma`] = w.ma_4w
    })
    return Object.values(map).sort((a, b) => a.week - b.week)
  }, [weekly])

  if (loading) return <Loader />

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Volume & Charge</h2>
        <div className="flex gap-2">
          {avYears.map(y => (
            <button key={y} onClick={() => toggle(y)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                selYears.includes(y) ? 'bg-strava text-white shadow-lg shadow-strava/20' : 'bg-dark-700 text-gray-400 hover:text-white hover:bg-dark-600'}`}>
              {y}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Kilometrage hebdomadaire" subtitle="Avec moyenne mobile 4 semaines">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={weeklyByYear}>
              <CartesianGrid {...gridStyle} />
              <XAxis dataKey="week" tick={axisStyle} />
              <YAxis tick={axisStyle} />
              <Tooltip content={<Tip />} />
              {selYears.map((y, i) => (
                <React.Fragment key={y}>
                  <Bar dataKey={y} fill={COLORS[i % COLORS.length]} fillOpacity={0.6} name={y} radius={[3, 3, 0, 0]} animationDuration={800} />
                  <Line dataKey={`${y}_ma`} stroke={COLORS[i % COLORS.length]} strokeWidth={2.5} dot={false} name={`MA ${y}`} animationDuration={1200} />
                </React.Fragment>
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Volume 90 jours glissants">
          {rolling.length > 0 && (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={rolling}>
                <defs>
                  <linearGradient id="gradRolling" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FC4C02" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#FC4C02" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey="date" tick={{ ...axisStyle, fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={axisStyle} />
                <Tooltip content={<Tip />} />
                <Area type="monotone" dataKey="km" stroke="#FC4C02" strokeWidth={2} fill="url(#gradRolling)" name="90j" animationDuration={1200} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Volume mensuel">
          {monthly.length > 0 && (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthly}>
                <defs>
                  <linearGradient id="gradMonthly" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FC4C02" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#FC4C02" stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey={d => `${d.year}-${d.month}`} tick={{ ...axisStyle, fontSize: 10 }} />
                <YAxis tick={axisStyle} />
                <Tooltip content={<Tip />} />
                <Bar dataKey="km" fill="url(#gradMonthly)" name="km" radius={[4, 4, 0, 0]} animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Volume annuel comparatif">
          {yearly.length > 0 && (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={yearly}>
                <defs>
                  <linearGradient id="gradYearly" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FC4C02" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#FC4C02" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey="year" tick={axisStyle} />
                <YAxis tick={axisStyle} />
                <Tooltip content={<Tip />} />
                <Bar dataKey="km" fill="url(#gradYearly)" name="km" radius={[6, 6, 0, 0]} animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  )
}
