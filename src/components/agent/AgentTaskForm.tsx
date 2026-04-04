"use client";

import { useState } from "react";

type TaskConfig = {
  geo: {
    mode: string;
    country: string;
    region: string;
    city: string;
    radius_km: number;
  };
  industry: {
    keywords: string[];
    pkd: string[];
  };
  entity_type: string[];
  sources: string[];
  quality_filters: {
    email_required: boolean;
    phone_required: boolean;
    website_required: boolean;
  };
  limit: number;
  speed: string;
};

export default function AgentTaskForm() {

  const [step, setStep] = useState(1);
  const [keywordInput, setKeywordInput] = useState("");

  const [form, setForm] = useState<TaskConfig>({
    geo: {
      mode: "local",
      country: "PL",
      region: "",
      city: "",
      radius_km: 50,
    },
    industry: {
      keywords: [],
      pkd: [],
    },
    entity_type: [],
    sources: [],
    quality_filters: {
      email_required: true,
      phone_required: false,
      website_required: true,
    },
    limit: 200,
    speed: "medium",
  });

  function toggleArray(field: "entity_type" | "sources", value: string) {
    setForm((prev) => {
      const arr = prev[field];
      return {
        ...prev,
        [field]: arr.includes(value)
          ? arr.filter((v) => v !== value)
          : [...arr, value],
      };
    });
  }

  function addKeyword() {
    if (!keywordInput.trim()) return;

    setForm((prev) => ({
      ...prev,
      industry: {
        ...prev.industry,
        keywords: [...prev.industry.keywords, keywordInput],
      },
    }));

    setKeywordInput("");
  }

  async function submitTask() {

  try {

    const res = await fetch("/api/agent/start-task",{
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body: JSON.stringify(form)
    })

    const data = await res.json()

    console.log("Agent started:", data)

    alert("Agent uruchomiony")

  } catch(err){

    console.error("Agent error:", err)

    alert("Błąd uruchamiania agenta")

  }

}

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white shadow rounded-xl">

      <h2 className="text-xl font-bold mb-6">
        Konfiguracja zadania – Agent AI
      </h2>

      {/* STEP 1 */}

      {step === 1 && (
        <div className="space-y-4">

          <h3 className="font-semibold">1. Gdzie szukać</h3>

          <select
            className="w-full border p-2 rounded"
            value={form.geo.mode}
            onChange={(e) =>
              setForm({
                ...form,
                geo: { ...form.geo, mode: e.target.value },
              })
            }
          >
            <option value="local">Lokalnie</option>
            <option value="eu">Europa</option>
            <option value="global">Global</option>
          </select>

          <input
            placeholder="Kraj"
            className="w-full border p-2 rounded"
            value={form.geo.country}
            onChange={(e) =>
              setForm({
                ...form,
                geo: { ...form.geo, country: e.target.value },
              })
            }
          />

          <input
            placeholder="Województwo"
            className="w-full border p-2 rounded"
            value={form.geo.region}
            onChange={(e) =>
              setForm({
                ...form,
                geo: { ...form.geo, region: e.target.value },
              })
            }
          />

          <input
            placeholder="Miasto"
            className="w-full border p-2 rounded"
            value={form.geo.city}
            onChange={(e) =>
              setForm({
                ...form,
                geo: { ...form.geo, city: e.target.value },
              })
            }
          />

          <input
            type="number"
            placeholder="Promień km"
            className="w-full border p-2 rounded"
            value={form.geo.radius_km}
            onChange={(e) =>
              setForm({
                ...form,
                geo: { ...form.geo, radius_km: Number(e.target.value) },
              })
            }
          />

        </div>
      )}

      {/* STEP 2 */}

      {step === 2 && (
        <div className="space-y-4">

          <h3 className="font-semibold">2. Kogo szukać</h3>

          <div className="flex gap-2">
            <input
              className="border p-2 rounded w-full"
              placeholder="Słowo kluczowe"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
            />
            <button
              onClick={addKeyword}
              className="bg-black text-white px-3 rounded"
            >
              +
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {form.industry.keywords.map((k) => (
              <span
                key={k}
                className="bg-gray-200 px-3 py-1 rounded text-sm"
              >
                {k}
              </span>
            ))}
          </div>

          <h4 className="font-medium pt-4">Typ podmiotu</h4>

          {["company", "person", "influencer", "shop", "mlm_prospect"].map(
            (type) => (
              <label key={type} className="block">
                <input
                  type="checkbox"
                  checked={form.entity_type.includes(type)}
                  onChange={() => toggleArray("entity_type", type)}
                />{" "}
                {type}
              </label>
            )
          )}

        </div>
      )}

      {/* STEP 3 */}

      {step === 3 && (
        <div className="space-y-4">

          <h3 className="font-semibold">3. Skąd pobierać dane</h3>

          {[
            "google",
            "facebook",
            "facebook_comments",
            "linkedin",
            "instagram",
            "directories",
            "websites",
            "public_registers",
          ].map((src) => (
            <label key={src} className="block">
              <input
                type="checkbox"
                checked={form.sources.includes(src)}
                onChange={() => toggleArray("sources", src)}
              />{" "}
              {src}
            </label>
          ))}

          <h4 className="font-medium pt-4">Filtry jakości</h4>

          <label className="block">
            <input
              type="checkbox"
              checked={form.quality_filters.email_required}
              onChange={(e) =>
                setForm({
                  ...form,
                  quality_filters: {
                    ...form.quality_filters,
                    email_required: e.target.checked,
                  },
                })
              }
            />
            wymagany email
          </label>

          <label className="block">
            <input
              type="checkbox"
              checked={form.quality_filters.phone_required}
              onChange={(e) =>
                setForm({
                  ...form,
                  quality_filters: {
                    ...form.quality_filters,
                    phone_required: e.target.checked,
                  },
                })
              }
            />
            wymagany telefon
          </label>

          <label className="block">
            <input
              type="checkbox"
              checked={form.quality_filters.website_required}
              onChange={(e) =>
                setForm({
                  ...form,
                  quality_filters: {
                    ...form.quality_filters,
                    website_required: e.target.checked,
                  },
                })
              }
            />
            wymagane WWW
          </label>

          <input
            type="number"
            className="border p-2 rounded w-full"
            placeholder="Limit leadów"
            value={form.limit}
            onChange={(e) =>
              setForm({
                ...form,
                limit: Number(e.target.value),
              })
            }
          />

        </div>
      )}

      {/* NAVIGATION */}

      <div className="flex justify-between pt-6">

        {step > 1 && (
          <button
            onClick={() => setStep(step - 1)}
            className="px-4 py-2 border rounded"
          >
            Wstecz
          </button>
        )}

        {step < 3 && (
          <button
            onClick={() => setStep(step + 1)}
            className="px-4 py-2 bg-black text-white rounded"
          >
            Dalej
          </button>
        )}

        {step === 3 && (
          <button
            onClick={submitTask}
            className="px-4 py-2 bg-green-600 text-white rounded"
          >
            Uruchom Agenta
          </button>
        )}

      </div>

    </div>
  );
}