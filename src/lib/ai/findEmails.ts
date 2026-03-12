export function findEmails(text: string): string[] {

  const regex =
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

  const matches = text.match(regex)

  if (!matches) return []

  return [...new Set(matches)]

}