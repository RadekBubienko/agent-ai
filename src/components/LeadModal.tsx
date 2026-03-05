"use client";
import { useEffect } from "react";
import LeadForm from "./LeadForm";

type Props = {
  open: boolean;
  path: string;
  onClose: () => void;
};

export default function LeadModal({ open, path, onClose }: Props) {
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    if (open) {
      window.addEventListener("keydown", handleEsc);
    }

    return () => {
      window.removeEventListener("keydown", handleEsc);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-gray-900 p-8 rounded-xl w-full max-w-md relative">
        {/* CLOSE BUTTON */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-white"
        >
          ✕
        </button>

        {/* TITLE */}
        <h3 className="text-xl text-white text-center mb-6">
          Podaj email aby otrzymać informacje
        </h3>

        {/* FORM */}
        <LeadForm path={path} onSuccess={onClose} />
      </div>
    </div>
  );
}
