"use client"

import { useState } from "react"

export default function LeadForm() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState("")

  const [errors, setErrors] = useState<{
    name?: string[]
    email?: string[]
  }>({})

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
  e.preventDefault()
  setStatus("Wysyłanie...")

  const res = await fetch("/api/lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email }),
  })

  const data = await res.json()  // ← czytamy TYLKO RAZ

  if (!res.ok) {
  setErrors(data.error.fieldErrors || {})
  setStatus("Błąd walidacji ❌")
  return
}

  setStatus("Lead zapisany ✅")
  setName("")
  setEmail("")
  setErrors({})
}

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 w-full max-w-md"
    >
      <input
        type="text"
        placeholder="Imię"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        className="p-3 rounded bg-gray-800 text-white"
      />

    {errors.name && (
      <p className="text-red-400 text-sm">
        {errors.name[0]}
      </p>
    )}

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="p-3 rounded bg-gray-800 text-white"
      />

      <button
        type="submit"
        className="bg-green-500 hover:bg-green-600 p-3 rounded font-semibold"
      >
        Zapisz się
      </button>

      {status && <p className="text-sm text-gray-300">{status}</p>}
    </form>
  )
}