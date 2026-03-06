"use client"

import { useEffect, useRef, useState } from "react"

export default function ScrollCTA() {

  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
        }
      },
      { threshold: 0.3 }
    )

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => {
      if (ref.current) observer.unobserve(ref.current)
    }

  }, [])

  return (
    <div ref={ref} className="mt-12 mb-12 flex justify-center">

      {visible && (
        <a
          href="/"
          className="bg-green-500 hover:bg-green-600 text-white px-8 py-4 rounded-xl font-semibold text-lg shadow-lg transition"
        >
          Zobacz więcej informacji
        </a>
      )}

    </div>
  )
}