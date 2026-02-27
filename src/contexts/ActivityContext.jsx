import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { getActivities, getCacheInfo, isAuthenticated } from '../api'

const ActivityContext = createContext(null)

export function ActivityProvider({ children }) {
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [cacheInfo, setCacheInfo] = useState(getCacheInfo())

  const load = useCallback(async (force = false) => {
    if (!isAuthenticated()) return
    try {
      if (force) setSyncing(true)
      else setLoading(true)
      setError(null)
      const acts = await getActivities(force)
      setActivities(acts)
      setCacheInfo(getCacheInfo())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <ActivityContext.Provider value={{ activities, loading, error, syncing, refresh: () => load(true), cacheInfo }}>
      {children}
    </ActivityContext.Provider>
  )
}

export function useActivities() {
  const ctx = useContext(ActivityContext)
  if (!ctx) throw new Error('useActivities must be used within ActivityProvider')
  return ctx
}
