import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function llmScore(text:string){

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
    return JSON.parse(output || "")
  }catch{

    console.log("AI parse error:", output)

    return { mlm_probability: 30 }

  }

}