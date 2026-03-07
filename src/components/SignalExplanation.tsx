"use client";

import Link from "next/link";
import { useRef } from "react";

export default function SignalExplanation() {
  const videoRef = useRef<HTMLVideoElement>(null);
  return (
    <section className="py-24 px-6 bg-white">
      <div className="max-w-5xl mx-auto text-center space-y-12">
        {/* nagłówek */}

        <div className="space-y-6">
          <h1 className="text-4xl md:text-5xl font-light leading-tight">
            Jak działa sygnał wspierający regenerację organizmu?
          </h1>

          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Organizm człowieka reaguje na określone długości fal światła. To
            zjawisko znane jest jako fotobiomodulacja.
          </p>
        </div>

        {/* video */}

        <div className="w-full max-w-3xl mx-auto aspect-video rounded-2xl overflow-hidden shadow-lg bg-black">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            controls
            className="w-full h-full"
          >
            <source src="/video/jak-to-dziala-LW.mp4" type="video/mp4" />
          </video>
        </div>

        {/* opis */}

        <div className="max-w-3xl mx-auto space-y-6 text-gray-700 text-lg">
          <p>
            W uproszczeniu oznacza to, że określone długości fal światła mogą
            wpływać na procesy biologiczne zachodzące w organizmie.
          </p>

          <p>
            Wykorzystując specjalne materiały optyczne można odbijać naturalne
            światło emitowane przez ciało w określony sposób, tworząc sygnał
            wspierający naturalne procesy regeneracyjne.
          </p>

          <p>
            Technologia ta była rozwijana przez ponad 20 lat badań nad
            interakcją światła z ludzką biologią.
          </p>
        </div>

        {/* CTA */}

        <div className="pt-6">
          <Link
            href="#wybor"
            className="inline-block px-10 py-4 rounded-xl bg-blue-600 text-white text-lg hover:bg-blue-700 transition"
          >
            Co chcesz zrobić dalej?
          </Link>
        </div>
      </div>
    </section>
  );
}
