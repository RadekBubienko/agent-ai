import type { LeadInput } from "@/types/agent"

export async function analyzeSocial(lead: LeadInput) {
  let engagement = 10

  if (lead.source === "instagram") engagement += 30
  if (lead.source === "linkedin") engagement += 20
  if (lead.source === "youtube") engagement += 25

  return { engagement }
}
