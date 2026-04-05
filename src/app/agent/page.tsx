"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AgentPageHeader from "@/components/agent/AgentPageHeader";
import { formatPolishDateTime } from "@/lib/formatPolishDateTime";

type Task = {
  id: string;
  status: string;
  leads_found: number;
  created_at: string;
};

function statusColor(status: string) {
  if (status === "running") return "bg-blue-100 text-blue-700";
  if (status === "finished") return "bg-green-100 text-green-700";
  if (status === "error") return "bg-red-100 text-red-700";

  return "bg-gray-100 text-gray-700";
}

function statusLabel(status: string) {
  if (status === "running") return "W trakcie";
  if (status === "finished") return "Zakończone";
  if (status === "error") return "Błąd";

  return status;
}

export default function AgentDashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    let active = true;

    async function loadTasks() {
      const res = await fetch("/api/agent/tasks");
      if (!res.ok || !active) return;

      const data: Task[] = await res.json();
      if (!active) return;

      setTasks(data);
    }

    void loadTasks();

    const interval = window.setInterval(() => {
      void loadTasks();
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <AgentPageHeader
        title="Panel Agenta"
        description="Uruchamiaj zadania, obserwuj ich status i sprawdzaj, ile leadów trafiło już do bazy."
        primaryAction={{
          href: "/agent/new-task",
          label: "Nowe zadanie",
        }}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Wszystkie zadania</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {tasks.length}
          </p>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Aktywne</p>
          <p className="mt-2 text-3xl font-semibold text-blue-700">
            {tasks.filter((task) => task.status === "running").length}
          </p>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Znalezione leady</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-700">
            {tasks.reduce((total, task) => total + task.leads_found, 0)}
          </p>
        </div>
      </div>

      <div className="space-y-4 md:hidden">
        {tasks.map((task) => (
          <article
            key={task.id}
            className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-gray-400">
                  Task ID
                </p>
                <p className="mt-2 break-all font-mono text-sm text-gray-800">
                  {task.id}
                </p>
              </div>

              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${statusColor(task.status)}`}
              >
                {statusLabel(task.status)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-gray-50 p-3">
                <p className="text-gray-500">Leady</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {task.leads_found}
                </p>
              </div>

              <div className="rounded-2xl bg-gray-50 p-3">
                <p className="text-gray-500">Utworzone</p>
                <p className="mt-1 text-sm font-medium text-gray-900">
                  {formatPolishDateTime(task.created_at)}
                </p>
              </div>
            </div>
          </article>
        ))}

        {tasks.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
            Brak zadań do wyświetlenia.
          </div>
        ) : null}
      </div>

      <div className="hidden overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="bg-gray-50 text-left">
              <tr className="text-sm text-gray-500">
                <th className="px-5 py-4 font-medium">Task ID</th>
                <th className="px-5 py-4 font-medium">Status</th>
                <th className="px-5 py-4 font-medium">Leady</th>
                <th className="px-5 py-4 font-medium">Utworzone</th>
                <th className="px-5 py-4 font-medium">Akcje</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {tasks.map((task) => (
                <tr key={task.id} className="align-top">
                  <td className="px-5 py-4 font-mono text-sm text-gray-800">
                    {task.id}
                  </td>

                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-medium ${statusColor(task.status)}`}
                    >
                      {statusLabel(task.status)}
                    </span>
                  </td>

                  <td className="px-5 py-4 text-sm font-semibold text-gray-900">
                    {task.leads_found}
                  </td>

                  <td className="px-5 py-4 text-sm text-gray-700">
                    {formatPolishDateTime(task.created_at)}
                  </td>

                  <td className="px-5 py-4">
                    <Link
                      href="/agent/leads"
                      className="inline-flex rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
                    >
                      Zobacz leady
                    </Link>
                  </td>
                </tr>
              ))}

              {tasks.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-10 text-center text-sm text-gray-500"
                  >
                    Brak zadań do wyświetlenia.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
