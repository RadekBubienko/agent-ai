"use client";

import { useEffect } from "react";
import LeadForm from "./LeadForm";

type Props = {
  open: boolean;
  path: string;
  onClose: () => void;
  onSuccess: () => void;
};

export default function LeadModal({ open, path, onClose, onSuccess }: Props) {
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    if (open) {
      window.addEventListener("keydown", handleEscape);
    }

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-md rounded-xl bg-gray-900 p-8">
        <button
          type="button"
          aria-label="Zamknij okno"
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-white"
        >
          ×
        </button>

        <h3 className="mb-6 text-center text-xl text-white">
          Podaj email, aby otrzymać informacje
        </h3>

        <LeadForm path={path} onSuccess={onSuccess} />
      </div>
    </div>
  );
}
