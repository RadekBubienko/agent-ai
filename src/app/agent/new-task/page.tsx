import AgentTaskForm from "@/components/agent/AgentTaskForm";
import AgentPageHeader from "@/components/agent/AgentPageHeader";

export default function Page() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <AgentPageHeader
        title="Nowe zadanie Agenta"
        description="Skonfiguruj źródła, słowa kluczowe i limity wyszukiwania, a potem uruchom zadanie bez wracania do innych widoków."
      />

      <AgentTaskForm />
    </div>
  );
}
