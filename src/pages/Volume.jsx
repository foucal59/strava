import React, { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ComposedChart, Line
} from 'recharts'
import { api } from '../api'
import { useAPI } from '../hooks/useAPI'
import ChartCard from '../components/ChartCard'
import Loader from '../components/Loader'

const COLORS = ['#FC4C02', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6']

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 shadow-xl">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="text-sm" style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value} km
        </div>
      ))}
    </div>
  )
}

export default function Volume() {
  const yr = new Date().getFullYear()
  const [selYears, setSelYears] = useState([yr.toString()])
  const { data: weekly, loading: wL } = useAPI(() => api.volumeWeekly(selYears.join(',')), [selYears])
  const { data: monthly, loading: mL } = useAPI(() => api.volumeMonthly())
  const { data: yearly, loading: yL } = useAPI(() => api.volumeYearly())
  const { data: rolling, loading: rL } = useAPI(() => api.volumeRolling(90))

  const avYears = yearly?.map(y => y.year) || []
  const toggle = (y) => setSelYears(p => p.includes(y) ? p.filter(x => x !== y) : [...p, y])

  const weeklyByYear = {}
  weekly?.forEach(w => {
    const wk = parseInt(w.week)
    if (!weeklyByYear[wk]) weeklyByYear[wk] = { week: wk }
    weeklyByYear[wk][w.year] = w.km
    weeklyByYear[wk][`${w.year}_ma`] = w.ma_4w
  })
  const wChart = Object.values(weeklyByYear).sort((a, b) => a.week - b.week)

  if (wL && mL) return <Loader />

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Volume & Charge</h2>
        <div className="flex gap-2">
          {avYears.map(y => (
            <button key={y} onClick={() => toggle(y)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                selYears.includes(y) ? 'bg-strava text-white' : 'bg-dark-700 text-gray-400 hover:text-white'}`}>
              {y}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Kilometrage hebdomadaire" subtitle="Avec moyenne mobile 4 semaines">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={wChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a25" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<Tip />} />
              {selYears.map((y, i) => (
                <React.Fragment key={y}>
                  <Bar dataKey={y} fill={COLORS[i % COLORS.length]} fillOpacity={0.7} name={y} />
                  <Line dataKey={`${y}_ma`} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} name={`MA ${y}`} />
                </React.Fragment>
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Volume 90 jours glissants">
          {!rL && rolling && (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={rolling}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a25" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<Tip />} />
                <Line dataKey="km" stroke="#FC4C02" strokeWidth={2} dot={false} name="90j" />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Volume mensuel">
          {!mL && monthly && (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a25" />
                <XAxis dataKey={d => `${d.year}-${d.month}`} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<Tip />} />
                <Bar dataKey="km" fill="#FC4C02" fillOpacity={0.8} name="km" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Volume annuel comparatif">
          {!yL && yearly && (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={yearly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a25" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<Tip />} />
                <Bar dataKey="km" fill="#FC4C02" name="km" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  )
}
