"use client"

import { useRef, useState } from "react"

export default function VideoPlayer() {

  const videoRef = useRef<HTMLVideoElement>(null)
  const [showCTA, setShowCTA] = useState(false)

  const handleTimeUpdate = () => {

    const video = videoRef.current
    if (!video) return

    const progress = video.currentTime / video.duration

    if (progress > 0.7) {
      setShowCTA(true)
    }
  }

  return (
    <div className="relative aspect-video rounded-xl overflow-hidden">

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        controls
        onTimeUpdate={handleTimeUpdate}
        className="w-full h-full"
      >
        <source src="/video/lifewave-intro.mp4" type="video/mp4" />
      </video>

      {showCTA && (
        <div className="absolute inset-0 flex items-end justify-center pb-10 pointer-events-none">

          <a
            href="/"
            className="pointer-events-auto bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-semibold shadow-lg"
          >
            Dowiedz się więcej
          </a>

        </div>
        
      )}

    </div>
  )
}