"use client"

import { useEffect, useState } from "react"

export default function ViewCounter() {

  const [views, setViews] = useState<number | null>(null)

  useEffect(() => {

    const updateViews = async () => {

      const res = await fetch("/api/video-view", {
        method: "POST"
      })

      const data = await res.json()

      setViews(data.views)

    }

    updateViews()

  }, [])

  if (!views) return null

  return (
    <div className="text-sm text-gray-400">
      Ten materiał obejrzało już <span className="text-white font-semibold">{views}</span> osób
    </div>
  )
}