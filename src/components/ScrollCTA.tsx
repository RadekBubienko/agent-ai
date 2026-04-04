"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export default function ScrollCTA() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
        }
      },
      { threshold: 0.3 },
    );

    const node = sectionRef.current;

    if (node) {
      observer.observe(node);
    }

    return () => {
      if (node) {
        observer.unobserve(node);
      }

      observer.disconnect();
    };
  }, []);

  return (
    <div ref={sectionRef} className="mt-12 mb-12 flex justify-center">
      {visible && (
        <Link
          href="/"
          className="bg-green-500 hover:bg-green-600 text-white px-8 py-4 rounded-xl font-semibold text-lg shadow-lg transition"
        >
          Zobacz więcej informacji
        </Link>
      )}
    </div>
  );
}
