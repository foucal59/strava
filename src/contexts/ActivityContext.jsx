import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react'
import { getActivities, getCacheInfo, isAuthenticated } from '../api'

const ActivityContext = createContext(null)

export function ActivityProvider({ children }) {
  const [allActivities, setAllActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [cacheInfo, setCacheInfo] = useState(getCacheInfo())
  const [dateRange, setDateRange] = useState(null) // null = all, { from: timestamp, to: timestamp }

  const load = useCallback(async (force = false) => {
    if (!isAuthenticated()) return
    try {
      if (force) setSyncing(true)
      else setLoading(true)
      setError(null)
      const acts = await getActivities(force)
      setAllActivities(acts)
      setCacheInfo(getCacheInfo())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Filtered activities based on date range
  const activities = useMemo(() => {
    if (!dateRange) return allActivities
    return allActivities.filter(a => {
      const t = new Date(a.start_date_local).getTime()
      return t >= dateRange.from && t <= dateRange.to
    })
  }, [allActivities, dateRange])

  return (
    <ActivityContext.Provider value={{
      activities, allActivities, loading, error, syncing,
      refresh: () => load(true), cacheInfo,
      dateRange, setDateRange
    }}>
      {children}
    </ActivityContext.Provider>
  )
}

export function useActivities() {
  const ctx = useContext(ActivityContext)
  if (!ctx) throw new Error('useActivities must be used within ActivityProvider')
  return ctx
}
