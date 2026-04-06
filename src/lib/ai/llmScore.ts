import OpenAI from "openai"

const apiKey = process.env.OPENAI_API_KEY
const openAiScoringEnabled = process.env.ENABLE_OPENAI_SCORING === "true"

if(!apiKey){
  console.log("OPENAI_API_KEY missing")
}

const openai = new OpenAI({
  apiKey
})


export async function llmScore(text:string){
  if (!openAiScoringEnabled) {
    return { mlm_probability: 0 }
  }

  const prompt = `
You are evaluating potential partners for a health and wellness
network marketing business.

Score how likely the owner of this business would be interested
in an additional income stream through network marketing.

Businesses more likely to be good partners include:
- wellness centers
- biohacking clinics
- fitness coaches
- nutrition coaches
- supplement stores
- longevity clinics
- health influencers

Businesses unlikely to be good partners:
- mechanics
- construction
- lawyers
- manufacturing companies

Return ONLY valid JSON.

Format:

{
 "mlm_probability": number
}

Business description:
${text}
`

  const response = await openai.responses.create({

    model: "gpt-5-mini",

    input: prompt

  })

  const output = response.output_text?.trim()

try{

  const result = JSON.parse(output || "")

  let score = result.mlm_probability

  // jeśli model zwróci 0-1
  if(score <= 1){
    score = Math.round(score * 100)
  }

  return { mlm_probability: score }

}catch{

  console.log("AI parse error:", output)

  return { mlm_probability: 30 }

}

}
