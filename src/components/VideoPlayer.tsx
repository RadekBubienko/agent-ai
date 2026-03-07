"use client";

import { useRef, useState } from "react";

export default function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showCTA, setShowCTA] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    if (!video.duration) return;

    const percent = video.currentTime / video.duration;

    setProgress(percent * 100);

    if (percent > 0.7) {
      setShowCTA(true);
    }
  };

  return (
    <>
    <div className="w-full m-0 p-0">
      <div className="w-full h-1 bg-gray-700">
        <div
          className="h-1 bg-green-500 transition-all"
          style={{ width: `${progress}%` }} />
      </div>

      <div className="text-xs text-gray-400 mt-0 text-right">
        {Math.floor(progress)}%
      </div>
    </div>
      <div className="relative aspect-video rounded-xl mt-1 overflow-hidden">

        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          controls
          onTimeUpdate={handleTimeUpdate}
          className="w-full h-full"
        >
          <source src="/video/intro.mp4" type="video/mp4" />
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
    </>
  );
}
