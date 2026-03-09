import { fetchWebsite } from "./fetchWebsite"
import { extractText } from "./extractText"
import { llmScore } from "@/lib/ai/llmScore"

export async function analyzeWebsite(website:string){

  if(!website){
    return { fit:10, intent:5 }
  }

  const html = await fetchWebsite(website)

  const text = extractText(html)

  const ai = await llmScore(text)

  const fit = Math.round(ai.mlm_probability * 0.6)
  const intent = Math.round(ai.mlm_probability * 0.4)

  return { fit, intent }

}