import React, { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { api } from './api'
import Layout from './components/Layout'
import Cockpit from './pages/Cockpit'
import Volume from './pages/Volume'
import Performance from './pages/Performance'
import Segments from './pages/Segments'
import Analysis from './pages/Analysis'

function LoginScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-semibold mb-2">
          <span className="text-strava">S</span>trava Dashboard
        </h1>
        <p className="text-gray-500 mb-8">Connectez votre compte Strava pour commencer</p>
        <a
          href="/auth/login"
          className="inline-flex items-center gap-2 px-6 py-3 bg-strava hover:bg-accent-light
                     text-white font-medium rounded-lg transition-colors"
        >
          Se connecter avec Strava
        </a>
      </div>
    </div>
  )
}

export default function App() {
  const [auth, setAuth] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.authStatus()
      .then(data => {
        setAuth(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-strava/30 border-t-strava rounded-full animate-spin" />
      </div>
    )
  }

  if (!auth?.authenticated) {
    return <LoginScreen />
  }

  return (
    <Layout athlete={auth.athlete}>
      <Routes>
        <Route path="/" element={<Cockpit />} />
        <Route path="/volume" element={<Volume />} />
        <Route path="/performance" element={<Performance />} />
        <Route path="/segments" element={<Segments />} />
        <Route path="/analysis" element={<Analysis />} />
      </Routes>
    </Layout>
  )
}
