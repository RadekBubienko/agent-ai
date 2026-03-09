export function extractText(html:string){

  if(!html) return ""

  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi,"")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi,"")
    .replace(/<[^>]+>/g," ")
    .replace(/\s+/g," ")
    .slice(0,2000)

}