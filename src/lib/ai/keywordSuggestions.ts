import OpenAI from "openai";

type KeywordSuggestionInput = {
  keywords: string[];
  entityTypes?: string[];
  geo?: {
    country?: string;
    region?: string;
    city?: string;
  };
  maxSuggestions?: number;
};

const apiKey = process.env.OPENAI_API_KEY;

function getOpenAiClient() {
  if (!apiKey) {
    return null;
  }

  return new OpenAI({ apiKey });
}

function normalizeKeyword(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function uniqueNormalizedKeywords(keywords: string[]) {
  const seen = new Set<string>();

  return keywords.filter((keyword) => {
    const normalized = normalizeKeyword(keyword);

    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

function buildLocationLabel(input?: KeywordSuggestionInput["geo"]) {
  return [input?.city, input?.region, input?.country]
    .map((item) => item?.trim())
    .filter(Boolean)
    .join(", ");
}

function parseSuggestionResponse(output: string): string[] {
  try {
    const parsed = JSON.parse(output);
    return Array.isArray(parsed?.suggestions)
      ? parsed.suggestions.filter(
          (suggestion: unknown): suggestion is string =>
            typeof suggestion === "string",
        )
      : [];
  } catch {
    return [];
  }
}

export function isAiKeywordSuggestionsEnabled() {
  return process.env.ENABLE_OPENAI_KEYWORD_SUGGESTIONS === "true";
}

export async function suggestKeywordsWithAi(input: KeywordSuggestionInput) {
  const client = getOpenAiClient();

  if (!client || !isAiKeywordSuggestionsEnabled()) {
    return [];
  }

  const keywords = uniqueNormalizedKeywords(
    input.keywords.map((keyword) => keyword.trim()).filter(Boolean),
  );

  if (keywords.length === 0) {
    return [];
  }

  const maxSuggestions = Math.min(Math.max(input.maxSuggestions ?? 6, 1), 10);
  const entityTypes = input.entityTypes?.filter(Boolean) ?? [];
  const locationLabel = buildLocationLabel(input.geo);

  const prompt = `
Zaproponuj slowa kluczowe do wyszukiwania leadow B2B/B2C dla agenta, ktory szuka:
- prywatnych gabinetow
- klinik prywatnych
- salonow
- specjalistow
- sklepów
- tworcow i marek wellness/health/beauty

Zwroc TYLKO poprawny JSON w formacie:
{
  "suggestions": ["fraza 1", "fraza 2"]
}

Wymagania:
- podaj od 3 do ${maxSuggestions} propozycji
- frazy maja byc konkretne i handlowe, gotowe do wyszukiwania leadow
- unikaj zbyt ogolnych hasel
- unikaj mediow, portali, instytucji publicznych i slow typu gov, nfz, wikipedia
- nie powtarzaj ani nie parafrazuj zbyt blisko wejściowych slow kluczowych
- preferuj prywatny, komercyjny intent typu gabinet, klinika prywatna, konsultacja, cennik, rejestracja, oferta
- zwracaj krotkie frazy, bez komentarzy i bez numeracji

Wejsciowe slowa kluczowe:
${keywords.join(", ")}

Typy podmiotow:
${entityTypes.join(", ") || "brak"}

Lokalizacja:
${locationLabel || "brak"}
`;

  const response = await client.responses.create({
    model: "gpt-5-mini",
    input: prompt,
  });

  const rawSuggestions = parseSuggestionResponse(response.output_text?.trim() ?? "");
  const normalizedSeeds = new Set(keywords.map(normalizeKeyword));

  return uniqueNormalizedKeywords(
    rawSuggestions
      .map((suggestion) => suggestion.trim())
      .filter(Boolean)
      .filter((suggestion) => !normalizedSeeds.has(normalizeKeyword(suggestion))),
  ).slice(0, maxSuggestions);
}
