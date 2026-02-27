import React, { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, ResponsiveContainer, ComposedChart, Area
} from 'recharts'
import { api } from '../api'
import { useAPI } from '../hooks/useAPI'
import ChartCard from '../components/ChartCard'
import Loader from '../components/Loader'

const COLORS = ['#FC4C02', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6']

function CustomTooltip({ active, payload, label }) {
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
  const currentYear = new Date().getFullYear()
  const [selectedYears, setSelectedYears] = useState([currentYear.toString()])
  const { data: weekly, loading: wLoad } = useAPI(() => api.volumeWeekly(selectedYears.join(',')), [selectedYears])
  const { data: monthly, loading: mLoad } = useAPI(() => api.volumeMonthly())
  const { data: yearly, loading: yLoad } = useAPI(() => api.volumeYearly())
  const { data: rolling, loading: rLoad } = useAPI(() => api.volumeRolling(90))

  const availableYears = yearly?.map(y => y.year) || []

  const toggleYear = (yr) => {
    setSelectedYears(prev =>
      prev.includes(yr) ? prev.filter(y => y !== yr) : [...prev, yr]
    )
  }

  // Reshape weekly data for multi-year overlay
  const weeklyByYear = {}
  weekly?.forEach(w => {
    const week = parseInt(w.week)
    if (!weeklyByYear[week]) weeklyByYear[week] = { week }
    weeklyByYear[week][w.year] = w.km
    weeklyByYear[week][`${w.year}_ma`] = w.ma_4w
  })
  const weeklyChart = Object.values(weeklyByYear).sort((a, b) => a.week - b.week)

  if (wLoad && mLoad) return <Loader />

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Volume & Charge</h2>
        <div className="flex gap-2">
          {availableYears.map(yr => (
            <button
              key={yr}
              onClick={() => toggleYear(yr)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                selectedYears.includes(yr)
                  ? 'bg-strava text-white'
                  : 'bg-dark-700 text-gray-400 hover:text-white'
              }`}
            >
              {yr}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Kilometrage hebdomadaire" subtitle="Avec moyenne mobile 4 semaines">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={weeklyChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a25" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              {selectedYears.map((yr, i) => (
                <React.Fragment key={yr}>
                  <Bar dataKey={yr} fill={COLORS[i % COLORS.length]} fillOpacity={0.7} name={yr} />
                  <Line
                    dataKey={`${yr}_ma`}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    name={`MA ${yr}`}
                  />
                </React.Fragment>
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Volume 90 jours glissants" subtitle="Cumul kilometrique">
          {!rLoad && rolling && (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={rolling}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a25" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Line dataKey="km" stroke="#FC4C02" strokeWidth={2} dot={false} name="90j glissants" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Volume mensuel">
          {!mLoad && monthly && (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a25" />
                <XAxis dataKey={(d) => `${d.year}-${d.month}`} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="km" fill="#FC4C02" fillOpacity={0.8} name="km" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Volume annuel comparatif">
          {!yLoad && yearly && (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={yearly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a25" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="km" fill="#FC4C02" name="km total" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  )
}
