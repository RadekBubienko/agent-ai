"use client";

import { useState, useEffect, useRef } from "react";

type Props = {
  path?: string;
  onSuccess?: () => void;
};

export default function LeadForm({ path, onSuccess }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const [errors, setErrors] = useState<{
    name?: string[];
    email?: string[];
  }>({});

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (loading) return;

    setLoading(true);
    setStatus("Wysyłanie...");

    const res = await fetch("/api/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        path,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setErrors(data.error.fieldErrors || {});
      setStatus("Błąd walidacji ❌");
      setLoading(false);
      return;
    }

    setStatus("Lead zapisany ✅");
    setName("");
    setEmail("");
    setErrors({});
    setLoading(false);

    if (onSuccess) {
      onSuccess();
    }

    setTimeout(() => {
      window.location.href = "/video";
    }, 800);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 w-full max-w-md"
    >
      <input
        type="text"
        placeholder="Imię"
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        className="p-3 rounded bg-gray-800 text-white"
      />

      {errors.name && <p className="text-red-400 text-sm">{errors.name[0]}</p>}

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
        disabled={loading}
        className="bg-green-500 hover:bg-green-600 p-3 rounded font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {loading && (
          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
        )}

        {loading ? "Wysyłanie..." : "Zapisz się"}
      </button>

      {status && <p className="text-sm text-gray-300">{status}</p>}
    </form>
  );
}
