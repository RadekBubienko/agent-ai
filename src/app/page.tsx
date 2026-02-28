import LeadForm from "@/components/LeadForm"

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white gap-8">
      <h1 className="text-4xl font-bold">
        Agent AI – Lead System
      </h1>

      <LeadForm />
    </main>
  )}