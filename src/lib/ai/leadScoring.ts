import { analyzeSocial } from "@/lib/ai/analyzeSocial";
import { analyzeWebsite } from "@/lib/ai/analyzeWebsite";
import type { LeadInput, LeadScore } from "@/types/agent";

export async function scoreLead(lead: LeadInput): Promise<LeadScore> {
  const websiteData = await analyzeWebsite(lead.website ?? "");
  const socialData = await analyzeSocial(lead);

  let fit_score = 0;
  let intent_score = 0;

  if (websiteData) {
    fit_score = websiteData.fit;
    intent_score = websiteData.intent;
  }

  const engagement_score = socialData?.engagement ?? 0;
  const total_score = fit_score + intent_score + engagement_score;

  let segment: LeadScore["segment"] = "cold";

  if (total_score > 70) segment = "hot";
  else if (total_score > 40) segment = "warm";

  return {
    fit_score,
    intent_score,
    engagement_score,
    total_score,
    segment,
  };
}
