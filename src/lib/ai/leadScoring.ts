import { analyzeWebsite } from "@/lib/ai/analyzeWebsite";
import { analyzeSocial } from "@/lib/ai/analyzeSocial";

export async function scoreLead(lead: any): Promise<{
  fit_score: number;
  intent_score: number;
  engagement_score: number;
  total_score: number;
  segment: string;
}> {
  const websiteData = await analyzeWebsite(lead);
  const socialData = await analyzeSocial(lead);

  let fit_score = 0;
  let intent_score = 0;

  if (websiteData) {
    fit_score = websiteData.fit;
    intent_score = websiteData.intent;
  }
  const engagement_score = socialData?.engagement ?? 0;

  const total_score = fit_score + intent_score + engagement_score;

  let segment = "cold";

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
