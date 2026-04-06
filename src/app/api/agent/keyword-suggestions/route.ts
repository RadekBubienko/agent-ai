import { NextResponse } from "next/server";
import {
  isAiKeywordSuggestionsEnabled,
  suggestKeywordsWithAi,
} from "@/lib/ai/keywordSuggestions";

export const maxDuration = 30;

type KeywordSuggestionRequest = {
  keywords?: string[];
  keywordInput?: string;
  entity_type?: string[];
  geo?: {
    country?: string;
    region?: string;
    city?: string;
  };
  maxSuggestions?: number;
};

export async function POST(req: Request) {
  let body: KeywordSuggestionRequest;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { enabled: false, suggestions: [], message: "Invalid payload" },
      { status: 400 },
    );
  }

  const keywords = [...(body.keywords ?? []), body.keywordInput ?? ""]
    .map((keyword) => keyword.trim())
    .filter(Boolean);

  if (keywords.length === 0) {
    return NextResponse.json(
      {
        enabled: false,
        suggestions: [],
        message: "Dodaj najpierw przynajmniej jedno slowo kluczowe.",
      },
      { status: 400 },
    );
  }

  if (!isAiKeywordSuggestionsEnabled()) {
    return NextResponse.json({
      enabled: false,
      suggestions: [],
      message:
        "Podpowiedzi AI sa przygotowane, ale obecnie wylaczone. Wlaczysz je pozniej flaga ENABLE_OPENAI_KEYWORD_SUGGESTIONS=true.",
    });
  }

  try {
    const suggestions = await suggestKeywordsWithAi({
      keywords,
      entityTypes: body.entity_type ?? [],
      geo: body.geo,
      maxSuggestions: body.maxSuggestions,
    });

    return NextResponse.json({
      enabled: true,
      suggestions,
      message:
        suggestions.length > 0
          ? "Gotowe propozycje slow kluczowych."
          : "AI nie zwrocilo nowych propozycji dla tego zestawu.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        enabled: true,
        suggestions: [],
        message:
          error instanceof Error
            ? error.message
            : "Nie udalo sie pobrac podpowiedzi AI.",
      },
      { status: 500 },
    );
  }
}
