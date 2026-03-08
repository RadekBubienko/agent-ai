export async function analyzeWebsite(website:string){

  if(!website){
    return { fit:10, intent:5 }
  }

  const keywords = [
    "health",
    "wellness",
    "fitness",
    "biohacking",
    "supplements",
    "coaching"
  ]

  let fit = 20
  let intent = 10

  const text = website.toLowerCase()

  for(const k of keywords){

    if(text.includes(k)){
      fit += 10
      intent += 5
    }

  }

  return { fit, intent }

}