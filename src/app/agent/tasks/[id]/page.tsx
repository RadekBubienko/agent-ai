"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import AgentPageHeader from "@/components/agent/AgentPageHeader";
import { formatPolishDateTime } from "@/lib/formatPolishDateTime";

type Task = {
  id: string;
  status: string;
  leads_found: number;
  created_at: string;
};

type TaskLog = {
  id: number;
  task_id: string;
  level: "info" | "success" | "warn" | "error";
  message: string;
  details: string | null;
  created_at: string;
};

function statusLabel(status: string) {
  if (status === "running") return "W trakcie";
  if (status === "finished") return "Zakończone";
  if (status === "error") return "Błąd";

  return status;
}

function statusClasses(status: string) {
  if (status === "running") return "bg-blue-100 text-blue-700";
  if (status === "finished") return "bg-emerald-100 text-emerald-700";
  if (status === "error") return "bg-red-100 text-red-700";

  return "bg-gray-100 text-gray-700";
}

function logLevelClasses(level: TaskLog["level"]) {
  if (level === "success") return "text-emerald-300";
  if (level === "warn") return "text-amber-300";
  if (level === "error") return "text-red-300";

  return "text-sky-300";
}

export default function AgentTaskDetailsPage() {
  const params = useParams<{ id: string }>();
  const taskId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [task, setTask] = useState<Task | null>(null);
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchTaskView() {
    if (!taskId) {
      return;
    }

    try {
      const [taskRes, logsRes] = await Promise.all([
        fetch(`/api/agent/tasks/${taskId}`),
        fetch(`/api/agent/tasks/${taskId}/logs?limit=250`),
      ]);

      if (!taskRes.ok) {
        throw new Error("Nie udało się pobrać taska");
      }

      if (!logsRes.ok) {
        throw new Error("Nie udało się pobrać logów taska");
      }

      const [taskData, logData] = await Promise.all([
        taskRes.json() as Promise<Task>,
        logsRes.json() as Promise<TaskLog[]>,
      ]);

      setTask(taskData);
      setLogs(logData);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }

  const loadTaskView = useEffectEvent(async () => {
    await fetchTaskView();
  });

  useEffect(() => {
    let active = true;

    async function loadWithGuard() {
      if (!active) {
        return;
      }

      await loadTaskView();
    }

    void loadWithGuard();

    const interval = window.setInterval(() => {
      void loadWithGuard();
    }, 3000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [taskId]);

  const terminalLines = useMemo(() => {
    return logs.map((log) => ({
      ...log,
      detailsText: log.details ? formatDetails(log.details) : null,
    }));
  }, [logs]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <AgentPageHeader
        title="Podgląd Taska"
        description="Widok pracy Agenta na żywo. Możesz podejrzeć status, liczbę zapisanych leadów i logi w stylu terminala."
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void fetchTaskView();
          }}
          className="ui-pressable inline-flex rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
        >
          Odśwież teraz
        </button>

        {taskId ? (
          <span className="rounded-full bg-gray-100 px-4 py-2 font-mono text-xs text-gray-600">
            {taskId}
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="ui-panel mb-6 rounded-3xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="ui-panel rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Status</p>
          <div className="mt-3">
            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${statusClasses(task?.status ?? "")}`}
            >
              {task ? statusLabel(task.status) : loading ? "Ładowanie..." : "-"}
            </span>
          </div>
        </div>

        <div className="ui-panel rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Leady zapisane</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {task?.leads_found ?? 0}
          </p>
        </div>

        <div className="ui-panel rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Utworzone</p>
          <p className="mt-2 text-base font-semibold text-gray-900">
            {task ? formatPolishDateTime(task.created_at) : "-"}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-gray-900 bg-[#0b1220] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-white">Terminal Taska</p>
            <p className="text-xs text-slate-400">
              Auto-refresh co 3 sekundy
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-red-400" />
            <span className="h-3 w-3 rounded-full bg-amber-400" />
            <span className="h-3 w-3 rounded-full bg-emerald-400" />
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 font-mono text-sm leading-6">
          {terminalLines.length === 0 ? (
            <p className="text-slate-400">
              {loading ? "Ładowanie logów..." : "Brak logów dla tego taska."}
            </p>
          ) : (
            terminalLines.map((log) => (
              <div key={log.id} className="mb-3 border-l border-white/10 pl-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-slate-500">
                    [{formatPolishDateTime(log.created_at)}]
                  </span>
                  <span className={logLevelClasses(log.level)}>
                    {log.level.toUpperCase()}
                  </span>
                  <span className="text-slate-100">{log.message}</span>
                </div>

                {log.detailsText ? (
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-2xl bg-white/5 p-3 text-xs text-slate-300">
                    {log.detailsText}
                  </pre>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function formatDetails(details: string) {
  try {
    return JSON.stringify(JSON.parse(details), null, 2);
  } catch {
    return details;
  }
}
