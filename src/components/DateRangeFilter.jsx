import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { Calendar } from 'lucide-react'
import { useActivities } from '../contexts/ActivityContext'

const PRESETS = [
  { label: '7j', days: 7 },
  { label: '30j', days: 30 },
  { label: '90j', days: 90 },
  { label: '6m', days: 183 },
  { label: '1a', days: 365 },
  { label: '2a', days: 730 },
  { label: 'Tout', days: null },
]

function fmtDate(ts) {
  const d = new Date(ts)
  const months = ['jan', 'fev', 'mar', 'avr', 'mai', 'jun', 'jul', 'aou', 'sep', 'oct', 'nov', 'dec']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

function DualSlider({ min, max, valueFrom, valueTo, onChange }) {
  const trackRef = useRef(null)
  const [dragging, setDragging] = useState(null) // 'from' | 'to' | null

  const pctFrom = max > min ? ((valueFrom - min) / (max - min)) * 100 : 0
  const pctTo = max > min ? ((valueTo - min) / (max - min)) * 100 : 100

  const getValueFromEvent = useCallback((e) => {
    const track = trackRef.current
    if (!track) return valueFrom
    const rect = track.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.round(min + pct * (max - min))
  }, [min, max, valueFrom])

  const handleStart = useCallback((thumb) => (e) => {
    e.preventDefault()
    setDragging(thumb)
  }, [])

  useEffect(() => {
    if (!dragging) return
    const handleMove = (e) => {
      const val = getValueFromEvent(e)
      if (dragging === 'from') {
        onChange(Math.min(val, valueTo - 86400000), valueTo)
      } else {
        onChange(valueFrom, Math.max(val, valueFrom + 86400000))
      }
    }
    const handleEnd = () => setDragging(null)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleEnd)
    window.addEventListener('touchmove', handleMove)
    window.addEventListener('touchend', handleEnd)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleEnd)
      window.removeEventListener('touchmove', handleMove)
      window.removeEventListener('touchend', handleEnd)
    }
  }, [dragging, valueFrom, valueTo, getValueFromEvent, onChange])

  return (
    <div className="relative h-8 flex items-center select-none" ref={trackRef}>
      {/* Track background */}
      <div className="absolute inset-x-0 h-1.5 rounded-full bg-dark-600" />
      {/* Active range */}
      <div
        className="absolute h-1.5 rounded-full bg-gradient-to-r from-strava/70 to-strava transition-all duration-75"
        style={{ left: `${pctFrom}%`, right: `${100 - pctTo}%` }}
      />
      {/* From thumb */}
      <div
        className={`absolute w-4 h-4 rounded-full border-2 border-strava bg-dark-800 cursor-grab -translate-x-1/2 transition-shadow ${
          dragging === 'from' ? 'shadow-lg shadow-strava/30 scale-110' : 'hover:shadow-md hover:shadow-strava/20'}`}
        style={{ left: `${pctFrom}%` }}
        onMouseDown={handleStart('from')}
        onTouchStart={handleStart('from')}
      />
      {/* To thumb */}
      <div
        className={`absolute w-4 h-4 rounded-full border-2 border-strava bg-dark-800 cursor-grab -translate-x-1/2 transition-shadow ${
          dragging === 'to' ? 'shadow-lg shadow-strava/30 scale-110' : 'hover:shadow-md hover:shadow-strava/20'}`}
        style={{ left: `${pctTo}%` }}
        onMouseDown={handleStart('to')}
        onTouchStart={handleStart('to')}
      />
    </div>
  )
}

export default function DateRangeFilter() {
  const { allActivities, dateRange, setDateRange } = useActivities()
  const [expanded, setExpanded] = useState(false)

  const bounds = useMemo(() => {
    if (!allActivities.length) return { min: Date.now() - 365 * 86400000, max: Date.now() }
    const dates = allActivities.map(a => new Date(a.start_date_local).getTime())
    return { min: Math.min(...dates), max: Math.max(...dates) }
  }, [allActivities])

  const activePreset = useMemo(() => {
    if (!dateRange) return 'Tout'
    for (const p of PRESETS) {
      if (!p.days) continue
      const expected = Date.now() - p.days * 86400000
      // Allow 12h tolerance
      if (Math.abs(dateRange.from - expected) < 43200000 && Math.abs(dateRange.to - Date.now()) < 43200000) {
        return p.label
      }
    }
    return null
  }, [dateRange])

  const handlePreset = useCallback((preset) => {
    if (!preset.days) {
      setDateRange(null)
    } else {
      setDateRange({
        from: Date.now() - preset.days * 86400000,
        to: Date.now()
      })
    }
  }, [setDateRange])

  const handleSliderChange = useCallback((from, to) => {
    setDateRange({ from, to })
  }, [setDateRange])

  const rangeLabel = dateRange
    ? `${fmtDate(dateRange.from)} — ${fmtDate(dateRange.to)}`
    : 'Toutes les donnees'

  const filteredCount = useMemo(() => {
    if (!dateRange || !allActivities.length) return allActivities.length
    return allActivities.filter(a => {
      const t = new Date(a.start_date_local).getTime()
      return t >= dateRange.from && t <= dateRange.to
    }).length
  }, [allActivities, dateRange])

  if (!allActivities.length) return null

  return (
    <div className="border-b border-dark-600/50 bg-dark-800/50 backdrop-blur-sm">
      <div className="max-w-screen-2xl mx-auto px-6">
        {/* Compact bar */}
        <div className="flex items-center justify-between h-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors"
            >
              <Calendar size={13} />
              <span className="font-medium">{rangeLabel}</span>
              <span className="text-gray-600">|</span>
              <span className="text-gray-500">{filteredCount} runs</span>
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            {PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => handlePreset(p)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200 ${
                  activePreset === p.label
                    ? 'bg-strava/15 text-strava'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-dark-700/50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Expanded slider */}
        {expanded && (
          <div className="pb-3 pt-1">
            <DualSlider
              min={bounds.min}
              max={bounds.max}
              valueFrom={dateRange?.from ?? bounds.min}
              valueTo={dateRange?.to ?? bounds.max}
              onChange={handleSliderChange}
            />
            <div className="flex justify-between text-xs text-gray-600 mt-1 px-1">
              <span>{fmtDate(bounds.min)}</span>
              <span>{fmtDate(bounds.max)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
