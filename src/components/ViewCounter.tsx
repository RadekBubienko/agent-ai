"use client";

import { useEffect, useState } from "react";

export default function ViewCounter() {
  const [views, setViews] = useState<number | null>(null);

  useEffect(() => {
    async function updateViews() {
      const res = await fetch("/api/video-view", {
        method: "POST",
      });

      const data: { views: number } = await res.json();
      setViews(data.views);
    }

    void updateViews();
  }, []);

  if (!views) return null;

  return (
    <div className="text-sm text-gray-400">
      Ten materiał obejrzało już{" "}
      <span className="text-white font-semibold">{views}</span> osób
    </div>
  );
}
