"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  path?: string;
  onSuccess?: () => void;
};

type LeadFormErrors = {
  name?: string[];
  email?: string[];
};

type LeadFormErrorResponse = {
  error?: {
    fieldErrors?: LeadFormErrors;
  };
};

export default function LeadForm({ path, onSuccess }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [errors, setErrors] = useState<LeadFormErrors>({});

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (loading) return;

    setLoading(true);
    setStatus("Wysyłanie...");
    setErrors({});

    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          path,
        }),
      });

      const data: LeadFormErrorResponse = await res.json();

      if (!res.ok) {
        setErrors(data.error?.fieldErrors || {});
        setStatus("Błąd walidacji");
        setLoading(false);
        return;
      }

      setStatus("Zapisano");
      setName("");
      setEmail("");
      setLoading(false);

      if (onSuccess) {
        onSuccess();
      }
    } catch {
      setStatus("Błąd połączenia");
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 w-full max-w-md"
    >
      <input
        ref={inputRef}
        type="text"
        placeholder="Imię"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        className={`p-3 rounded bg-gray-800 text-white ${
          errors.name ? "border border-red-500" : ""
        }`}
      />

      {errors.name && <p className="text-red-400 text-sm">{errors.name[0]}</p>}

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className={`p-3 rounded bg-gray-800 text-white ${
          errors.email ? "border border-red-500" : ""
        }`}
      />

      {errors.email && (
        <p className="text-red-400 text-sm">{errors.email[0]}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="bg-green-500 hover:bg-green-600 p-3 rounded font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {loading && (
          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        )}

        {loading ? "Wysyłanie..." : "Zapisz się"}
      </button>

      {status && <p className="text-sm text-gray-300 text-center">{status}</p>}
    </form>
  );
}
