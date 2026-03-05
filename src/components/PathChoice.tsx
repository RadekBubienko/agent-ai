"use client";

import { useState } from "react";
import LeadModal from "./LeadModal";

export default function PathChoice() {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPath, setSelectedPath] = useState("education");
  const [success, setSuccess] = useState(false);

  const [choice, setChoice] = useState<string | null>(null);

  return (
    <>
      <section id="choice" className="py-24 bg-black text-white px-6">
        <div className="max-w-3xl mx-auto text-center space-y-10">
          <h2 className="text-3xl font-light">
            Co Cię najbardziej interesuje?
          </h2>

          <div className="space-y-4 text-lg">
            <button
              onClick={() => {
                setSelectedPath("product");
                setModalOpen(true);
              }}
              className="block w-full border p-5 rounded-lg hover:bg-white hover:text-black"
            >
              Chcę poznać produkt
            </button>

            <button
              onClick={() => {
                setSelectedPath("business");
                setModalOpen(true);
              }}
              className="block w-full border p-5 rounded-lg hover:bg-white hover:text-black"
            >
              Interesuje mnie model współpracy
            </button>

            <button
              onClick={() => {
                setSelectedPath("education");
                setModalOpen(true);
              }}
              className="block w-full border p-5 rounded-lg hover:bg-white hover:text-black"
            >
              Na razie chcę tylko zrozumieć jak to działa
            </button>
          </div>

          {choice && <p className="text-gray-300">Wybrana ścieżka: {choice}</p>}
        </div>
        {success && (
          <div className="mt-12 p-6 bg-green-900/40 border border-green-500 rounded-xl text-center max-w-xl mx-auto">
            <h3 className="text-xl font-semibold mb-2">
              Sprawdź swoją skrzynkę 📩
            </h3>

            <p className="text-gray-300">
              Wysłaliśmy pierwszy materiał, który wyjaśnia jak działa ta
              technologia. Jeśli nie widzisz wiadomości — sprawdź folder spam.
            </p>
          </div>
        )}
      </section>
      <LeadModal
        open={modalOpen}
        path={selectedPath}
        onClose={() => {
          setModalOpen(false);
          setSuccess(true);
        }}
      />
    </>
  );
}
