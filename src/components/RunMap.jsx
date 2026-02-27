import React, { useEffect, useRef, useMemo } from 'react'

// Polyline decoder
function decodePolyline(str) {
  const points = []
  let index = 0, lat = 0, lng = 0
  while (index < str.length) {
    let b, shift = 0, result = 0
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lat += (result & 1) ? ~(result >> 1) : (result >> 1)
    shift = 0; result = 0
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lng += (result & 1) ? ~(result >> 1) : (result >> 1)
    points.push([lat / 1e5, lng / 1e5])
  }
  return points
}

export default function RunMap({ runs, height = 400, singleRun = false, className = '' }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)

  const decodedRuns = useMemo(() =>
    (runs || []).filter(r => r.polyline).map(r => ({
      ...r,
      points: decodePolyline(r.polyline)
    })).filter(r => r.points.length > 1),
    [runs]
  )

  useEffect(() => {
    if (!mapRef.current || decodedRuns.length === 0) return
    if (typeof window === 'undefined') return

    // Dynamic import of Leaflet
    const initMap = async () => {
      if (!window.L) {
        // Load Leaflet CSS
        if (!document.getElementById('leaflet-css')) {
          const link = document.createElement('link')
          link.id = 'leaflet-css'
          link.rel = 'stylesheet'
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
          document.head.appendChild(link)
        }
        // Load Leaflet JS
        await new Promise((resolve, reject) => {
          if (window.L) { resolve(); return }
          const script = document.createElement('script')
          script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
          script.onload = resolve
          script.onerror = reject
          document.head.appendChild(script)
        })
      }

      const L = window.L

      // Clean up previous map
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }

      const map = L.map(mapRef.current, {
        zoomControl: !singleRun,
        attributionControl: false,
        scrollWheelZoom: !singleRun ? true : false,
      })

      // Dark tile layer
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(map)

      const allBounds = []

      decodedRuns.forEach((run, i) => {
        const opacity = singleRun ? 0.9 : Math.max(0.3, 1 - i * 0.03)
        const weight = singleRun ? 3 : 2
        const polyline = L.polyline(run.points, {
          color: '#FC4C02',
          weight,
          opacity,
          smoothFactor: 1
        }).addTo(map)

        if (!singleRun) {
          polyline.bindPopup(`
            <div style="font-family: Inter, sans-serif; color: #e5e7eb;">
              <div style="font-weight: 600; margin-bottom: 4px;">${run.name || 'Run'}</div>
              <div style="font-size: 12px; color: #9ca3af;">${run.date?.slice(0, 10)} | ${run.distanceKm} km | ${run.pace}/km</div>
            </div>
          `, { className: 'dark-popup' })
        }

        allBounds.push(...run.points)
      })

      if (allBounds.length > 0) {
        map.fitBounds(L.latLngBounds(allBounds).pad(0.1))
      }

      mapInstanceRef.current = map
    }

    initMap()

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [decodedRuns, singleRun])

  if (!decodedRuns.length) {
    return (
      <div className={`flex items-center justify-center bg-dark-800 rounded-xl ${className}`} style={{ height }}>
        <span className="text-gray-600 text-sm">Aucune trace GPS disponible</span>
      </div>
    )
  }

  return <div ref={mapRef} className={`rounded-xl overflow-hidden ${className}`} style={{ height }} />
}
