"use client";

import Link from "next/link";
import { useRef } from "react";

export default function SignalExplanation() {
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <section className="py-24 px-6 bg-white">
      <div className="max-w-5xl mx-auto text-center space-y-12">
        <div className="space-y-6">
          <h1 className="text-4xl md:text-5xl font-light leading-tight">
            Jak działa sygnał wspierający regenerację organizmu?
          </h1>

          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Organizm człowieka reaguje na określone długości fal światła. To
            zjawisko znane jest jako fotobiomodulacja.
          </p>
        </div>

        <div className="ui-panel mx-auto aspect-video w-full max-w-3xl overflow-hidden rounded-2xl bg-black shadow-lg">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            controls
            preload="metadata"
            className="w-full h-full"
          >
            <source src="/media/jak-to-dziala.mp4" type="video/mp4" />
          </video>
        </div>

        <div className="max-w-3xl mx-auto space-y-6 text-lg text-gray-700">
          <p>
            W uproszczeniu oznacza to, że określone długości fal światła mogą
            wpływać na procesy biologiczne zachodzące w organizmie.
          </p>

          <p>
            Wykorzystując specjalne materiały optyczne, można odbijać naturalne
            światło emitowane przez ciało w określony sposób, tworząc sygnał
            wspierający naturalne procesy regeneracyjne.
          </p>

          <p>
            Technologia ta była rozwijana przez ponad 20 lat badań nad
            interakcją światła z ludzką biologią.
          </p>
        </div>

        <div className="pt-6">
          <Link
            href="#wybor"
            className="ui-pressable inline-block rounded-xl bg-blue-600 px-10 py-4 text-lg text-white transition hover:bg-blue-700"
          >
            Co chcesz zrobić dalej?
          </Link>
        </div>
      </div>
    </section>
  );
}
