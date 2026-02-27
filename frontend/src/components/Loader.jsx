import React from 'react'

export default function Loader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-strava/30 border-t-strava rounded-full animate-spin" />
    </div>
  )
}
