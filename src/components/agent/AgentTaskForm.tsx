"use client";

import { useState } from "react";
import type { TaskConfig } from "@/types/agent";

const KEYWORD_SUGGESTION_GROUPS = [
  {
    triggers: ["samoleczenie"],
    suggestions: [
      "autoterapia",
      "terapia holistyczna",
      "medycyna integracyjna",
      "biohacking",
    ],
  },
  {
    triggers: ["zdrowie", "wellness"],
    suggestions: [
      "biohacking",
      "longevity",
      "medycyna funkcjonalna",
      "klinika prywatna",
    ],
  },
  {
    triggers: ["uroda"],
    suggestions: [
      "medycyna estetyczna",
      "kosmetologia",
      "beauty clinic",
      "salon kosmetologiczny",
    ],
  },
  {
    triggers: ["autoterapia"],
    suggestions: [
      "terapia holistyczna",
      "medycyna integracyjna",
      "biohacking",
    ],
  },
  {
    triggers: ["biohacking"],
    suggestions: ["longevity", "medycyna funkcjonalna", "wellness"],
  },
];

function normalizeKeyword(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function getKeywordSuggestions(keywords: string[], keywordInput: string) {
  const activeKeywords = [...keywords, keywordInput].filter(Boolean);
  const normalizedKeywords = activeKeywords.map(normalizeKeyword);
  const existing = new Set(keywords.map(normalizeKeyword));
  const suggestions: string[] = [];

  for (const group of KEYWORD_SUGGESTION_GROUPS) {
    const matches = group.triggers.some((trigger) =>
      normalizedKeywords.some((keyword) => keyword.includes(trigger)),
    );

    if (!matches) {
      continue;
    }

    for (const suggestion of group.suggestions) {
      const normalizedSuggestion = normalizeKeyword(suggestion);

      if (
        existing.has(normalizedSuggestion) ||
        normalizedKeywords.some((keyword) => keyword === normalizedSuggestion) ||
        suggestions.some(
          (currentSuggestion) =>
            normalizeKeyword(currentSuggestion) === normalizedSuggestion,
        )
      ) {
        continue;
      }

      suggestions.push(suggestion);
    }
  }

  return suggestions;
}

export default function AgentTaskForm() {
  const [step, setStep] = useState(1);
  const [keywordInput, setKeywordInput] = useState("");
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [aiSuggestionMessage, setAiSuggestionMessage] = useState("");
  const [isAiSuggestionLoading, setIsAiSuggestionLoading] = useState(false);

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
    facebook: {
      page_id: "",
      days_back: 30,
      scan_entire_page: true,
      include_comments: true,
      include_reactions: true,
    },
    limit: 200,
    speed: "slow",
  });

  const suggestedKeywords = getKeywordSuggestions(
    form.industry.keywords,
    keywordInput,
  );

  function toggleArray(field: "entity_type" | "sources", value: string) {
    setForm((prev) => {
      const arr = prev[field];

      return {
        ...prev,
        [field]: arr.includes(value)
          ? arr.filter((item) => item !== value)
          : [...arr, value],
      };
    });
  }

  function addKeywordValue(value: string) {
    const trimmed = value.trim().replace(/\s+/g, " ");

    if (!trimmed) {
      return;
    }

    setForm((prev) => {
      const normalizedNewKeyword = normalizeKeyword(trimmed);
      const alreadyExists = prev.industry.keywords.some(
        (keyword) => normalizeKeyword(keyword) === normalizedNewKeyword,
      );

      if (alreadyExists) {
        return prev;
      }

      return {
        ...prev,
        industry: {
          ...prev.industry,
          keywords: [...prev.industry.keywords, trimmed],
        },
      };
    });

    setAiSuggestions((prev) =>
      prev.filter(
        (suggestion) => normalizeKeyword(suggestion) !== normalizeKeyword(trimmed),
      ),
    );
  }

  function addKeyword() {
    if (!keywordInput.trim()) {
      return;
    }

    addKeywordValue(keywordInput);
    setKeywordInput("");
  }

  function removeKeyword(keywordToRemove: string) {
    setForm((prev) => ({
      ...prev,
      industry: {
        ...prev.industry,
        keywords: prev.industry.keywords.filter(
          (keyword) => keyword !== keywordToRemove,
        ),
      },
    }));
  }

  async function loadAiSuggestions() {
    const candidateKeywords = [...form.industry.keywords, keywordInput]
      .map((keyword) => keyword.trim())
      .filter(Boolean);

    if (candidateKeywords.length === 0) {
      setAiSuggestions([]);
      setAiSuggestionMessage("Dodaj lub wpisz najpierw slowo kluczowe.");
      return;
    }

    setIsAiSuggestionLoading(true);
    setAiSuggestionMessage("");

    try {
      const res = await fetch("/api/agent/keyword-suggestions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          keywords: form.industry.keywords,
          keywordInput,
          entity_type: form.entity_type,
          geo: form.geo,
          maxSuggestions: 6,
        }),
      });

      const data = await res.json();
      const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];

      setAiSuggestions(suggestions);
      setAiSuggestionMessage(
        typeof data?.message === "string"
          ? data.message
          : suggestions.length > 0
            ? "Gotowe propozycje slow kluczowych."
            : "",
      );
    } catch (error) {
      console.error("AI keyword suggestion error:", error);
      setAiSuggestions([]);
      setAiSuggestionMessage("Nie udalo sie pobrac podpowiedzi AI.");
    } finally {
      setIsAiSuggestionLoading(false);
    }
  }

  async function submitTask() {
    try {
      const res = await fetch("/api/agent/start-task", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      console.log("Agent started:", data);
      alert("Agent uruchomiony");
    } catch (err) {
      console.error("Agent error:", err);
      alert("Blad uruchamiania agenta");
    }
  }

  return (
    <div className="ui-panel mx-auto max-w-2xl rounded-xl bg-white p-6 shadow">
      <h2 className="mb-6 text-xl font-bold">Konfiguracja zadania - Agent AI</h2>

      {step === 1 && (
        <div className="space-y-4">
          <h3 className="font-semibold">1. Gdzie szukac</h3>

          <select
            className="w-full rounded border p-2"
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
            className="w-full rounded border p-2"
            value={form.geo.country}
            onChange={(e) =>
              setForm({
                ...form,
                geo: { ...form.geo, country: e.target.value },
              })
            }
          />

          <input
            placeholder="Wojewodztwo"
            className="w-full rounded border p-2"
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
            className="w-full rounded border p-2"
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
            placeholder="Promien km"
            className="w-full rounded border p-2"
            value={form.geo.radius_km}
            onChange={(e) =>
              setForm({
                ...form,
                geo: { ...form.geo, radius_km: Number(e.target.value) },
              })
            }
          />

          <label className="block space-y-2">
            <span className="font-medium">Tempo pracy</span>
            <select
              className="w-full rounded border p-2"
              value={form.speed}
              onChange={(e) =>
                setForm({
                  ...form,
                  speed: e.target.value as TaskConfig["speed"],
                })
              }
            >
              <option value="fast">Szybko - mniej sprawdza</option>
              <option value="medium">Srednio - balans</option>
              <option value="slow">Dokladniej - wiecej leadow</option>
            </select>
          </label>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h3 className="font-semibold">2. Kogo szukac</h3>

          <div className="flex gap-2">
            <input
              className="w-full rounded border p-2"
              placeholder="Slowo kluczowe"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addKeyword();
                }
              }}
            />
            <button
              type="button"
              onClick={addKeyword}
              className="rounded bg-black px-3 text-white"
            >
              +
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={loadAiSuggestions}
              disabled={isAiSuggestionLoading}
              className="rounded border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isAiSuggestionLoading
                ? "Pobieranie podpowiedzi AI..."
                : "Podpowiedz slowa z AI"}
            </button>
            <p className="text-sm text-gray-500">
              Szkielet gotowy. Na razie bezpiecznie wylaczone flaga.
            </p>
          </div>

          {suggestedKeywords.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">
                Podpowiedzi lepszych fraz
              </p>
              <p className="mt-1 text-sm text-amber-800">
                Dla szerokich hasel lepiej dzialaja bardziej konkretne slowa
                kluczowe.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {suggestedKeywords.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => addKeywordValue(suggestion)}
                    className="rounded-full border border-amber-300 bg-white px-3 py-1 text-sm text-amber-900 hover:bg-amber-100"
                  >
                    + {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(aiSuggestionMessage || aiSuggestions.length > 0) && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-sm font-medium text-blue-900">
                Podpowiedzi AI
              </p>
              {aiSuggestionMessage && (
                <p className="mt-1 text-sm text-blue-800">
                  {aiSuggestionMessage}
                </p>
              )}
              {aiSuggestions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {aiSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => addKeywordValue(suggestion)}
                      className="rounded-full border border-blue-300 bg-white px-3 py-1 text-sm text-blue-900 hover:bg-blue-100"
                    >
                      + {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {form.industry.keywords.map((keyword) => (
              <button
                key={keyword}
                type="button"
                onClick={() => removeKeyword(keyword)}
                className="rounded bg-gray-200 px-3 py-1 text-sm hover:bg-gray-300"
                title="Usun slowo kluczowe"
              >
                {keyword} x
              </button>
            ))}
          </div>

          <h4 className="pt-4 font-medium">Typ podmiotu</h4>

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
            ),
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h3 className="font-semibold">3. Skad pobierac dane</h3>

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
              {src === "facebook"
                ? "Facebook - Owned Page Hunter"
                : src === "facebook_comments"
                  ? "Facebook (komentarze)"
                  : src}
            </label>
          ))}

          {form.sources.includes("facebook") ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-medium text-emerald-900">
                Facebook - Owned Page Lead Hunter
              </p>
              <p className="mt-1 text-sm text-emerald-800">
                Ten tryb skanuje Wasza wlasna strone przez Graph API, przeglada
                posty z wybranego okresu i szuka osob reagujacych lub
                komentujacych.
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-emerald-900">
                    Dni wstecz
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    className="w-full rounded border border-emerald-200 bg-white p-2"
                    value={form.facebook?.days_back ?? 30}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        facebook: {
                          ...form.facebook,
                          days_back: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-emerald-900">
                    Opcjonalny Page ID
                  </span>
                  <input
                    className="w-full rounded border border-emerald-200 bg-white p-2"
                    placeholder="Domyslnie z .env"
                    value={form.facebook?.page_id ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        facebook: {
                          ...form.facebook,
                          page_id: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              </div>

              <div className="mt-4 space-y-2 text-sm text-emerald-900">
                <label className="block">
                  <input
                    type="checkbox"
                    checked={form.facebook?.scan_entire_page ?? true}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        facebook: {
                          ...form.facebook,
                          scan_entire_page: e.target.checked,
                        },
                      })
                    }
                  />{" "}
                  przeskanuj cala strone, nie tylko posty trafiajace w slowa
                  kluczowe
                </label>

                <label className="block">
                  <input
                    type="checkbox"
                    checked={form.facebook?.include_comments ?? true}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        facebook: {
                          ...form.facebook,
                          include_comments: e.target.checked,
                        },
                      })
                    }
                  />{" "}
                  analizuj komentarze
                </label>

                <label className="block">
                  <input
                    type="checkbox"
                    checked={form.facebook?.include_reactions ?? true}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        facebook: {
                          ...form.facebook,
                          include_reactions: e.target.checked,
                        },
                      })
                    }
                  />{" "}
                  probuj pobrac reakcje i lajki
                </label>
              </div>

              {form.quality_filters.email_required ? (
                <p className="mt-3 text-sm text-amber-800">
                  Uwaga: dla Owned Page Huntera email zwykle nie jest dostepny.
                  Jesli zalezy Ci na kontaktach do rozmowy na Facebooku, rozważ
                  odznaczenie filtra &quot;wymagany email&quot;.
                </p>
              ) : null}
            </div>
          ) : null}

          <h4 className="pt-4 font-medium">Filtry jakosci</h4>

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
            />{" "}
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
            />{" "}
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
            />{" "}
            wymagane WWW
          </label>

          <input
            type="number"
            className="w-full rounded border p-2"
            placeholder="Limit leadow"
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

      <div className="flex justify-between pt-6">
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="rounded border px-4 py-2"
          >
            Wstecz
          </button>
        )}

        {step < 3 && (
          <button
            type="button"
            onClick={() => setStep(step + 1)}
            className="rounded bg-black px-4 py-2 text-white"
          >
            Dalej
          </button>
        )}

        {step === 3 && (
          <button
            type="button"
            onClick={submitTask}
            className="rounded bg-green-600 px-4 py-2 text-white"
          >
            Uruchom Agenta
          </button>
        )}
      </div>
    </div>
  );
}
