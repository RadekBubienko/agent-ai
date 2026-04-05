import type { LeadInput } from "@/types/agent"

export async function analyzeSocial(lead: LeadInput) {
  let engagement = 10
  const channel = lead.platform ?? lead.source ?? ""

  if (channel === "instagram") engagement += 30
  if (channel === "linkedin") engagement += 20
  if (channel === "youtube") engagement += 25

  return { engagement }
}
