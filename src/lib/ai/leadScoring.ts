import { analyzeWebsite } from "@/lib/ai/analyzeWebsite";
import { analyzeSocial } from "@/lib/ai/analyzeSocial";

export async function scoreLead(lead: any) {
  const websiteData = await analyzeWebsite(lead.website);
  const socialData = await analyzeSocial(lead);

  const fit_score = websiteData.fit;
  const intent_score = websiteData.intent;
  const engagement_score = socialData.engagement;

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
