import React, { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { isAuthenticated, getAthlete, parseAuthCallback, clearTokens } from './api'
import Layout from './components/Layout'
import Cockpit from './pages/Cockpit'
import Volume from './pages/Volume'
import Performance from './pages/Performance'
import Segments from './pages/Segments'
import Analysis from './pages/Analysis'

function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-semibold mb-2">
          <span className="text-strava">S</span>trava Dashboard
        </h1>
        <p className="text-gray-500 mb-8">Connectez votre compte Strava</p>
        <a href="/api/auth/login"
          className="inline-flex items-center gap-2 px-6 py-3 bg-strava hover:bg-accent-light text-white font-medium rounded-lg transition-colors">
          Se connecter avec Strava
        </a>
      </div>
    </div>
  )
}

export default function App() {
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    // Check if returning from OAuth callback
    if (window.location.hash.includes('access_token')) {
      parseAuthCallback()
    }
    setAuthed(isAuthenticated())
  }, [])

  if (!authed) return <Login />

  const athlete = getAthlete()

  return (
    <Layout athlete={athlete} onLogout={() => { clearTokens(); setAuthed(false) }}>
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
