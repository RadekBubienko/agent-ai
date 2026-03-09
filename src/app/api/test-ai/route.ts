import { llmScore } from "@/lib/ai/llmScore"

export async function GET(){

  const result = await llmScore(`
Biohacking wellness center.
We sell supplements, longevity products and run a health coaching business.
Looking for new business opportunities.
`)

  return Response.json(result)

}