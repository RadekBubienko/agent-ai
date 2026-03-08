export async function fetchWebsite(url:string){

  if(!url) return ""

  try{

    if(!url.startsWith("http")){
      url = "https://" + url
    }

    const res = await fetch(url,{
      headers:{
        "User-Agent":"Mozilla/5.0 AgentAI"
      }
    })

    const html = await res.text()

    return html.slice(0,15000)

  }catch(err){

    console.log("website fetch error",err)

    return ""
  }

}