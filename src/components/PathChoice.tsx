"use client";

import { useState } from "react";
import LeadModal from "./LeadModal";
import { useRouter } from "next/navigation";

const labels = {
    product: "Poznanie produktu",
    business: "Model współpracy",
    education: "Jak działa technologia",
  };

export default function PathChoice() {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPath, setSelectedPath] = useState("education");
  const [success, setSuccess] = useState(false);
  const [choice, setChoice] = useState<"product" | "business" | "education" | null>(null);
  const router = useRouter();
  const [showChoiceInfo, setShowChoiceInfo] = useState(false);

  

  const handleChoice = (path: "product" | "business" | "education") => {
    setSelectedPath(path);
    setChoice(path);

    setShowChoiceInfo(true);

    setTimeout(() => {
      setModalOpen(true);
    }, 800);
  };

  return (
    <>
      <section id="choice" className="py-24 bg-blue-600 text-white px-6">
        <div className="max-w-3xl mx-auto text-center space-y-10">
          <h2 className="text-3xl font-light">
            Co Cię najbardziej interesuje?
          </h2>

          <div className="space-y-4 text-lg">
            <button
              onClick={() => handleChoice("product")}
              className="block w-full border p-5 rounded-lg hover:bg-white hover:text-black"
            >
              Chcę poznać produkt
            </button>

            <button
              onClick={() => handleChoice("business")}
              className="block w-full border p-5 rounded-lg hover:bg-white hover:text-black"
            >
              Interesuje mnie model współpracy
            </button>

            <button
              onClick={() => handleChoice("education")}
              className="block w-full border p-5 rounded-lg hover:bg-white hover:text-black"
            >
              Na razie chcę tylko zrozumieć jak to działa
            </button>
          </div>

          {showChoiceInfo && choice && (
            <div className="text-gray-300 mt-6">
              Wybrałeś: <span className="text-white">{labels[choice]}</span>
              <div className="text-sm opacity-70 mt-1">
                Za chwilę poprosimy o email aby wysłać materiały.
              </div>
            </div>
          )}
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
        onClose={() => setModalOpen(false)}
        onSuccess={() => {
          setModalOpen(false);
          router.push("/video");
        }}
      />
    </>
  );
}
