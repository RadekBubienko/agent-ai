"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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

export default function AgentDashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);

  async function loadTasks() {
    const res = await fetch("/api/agent/tasks");

    const data = await res.json();

    setTasks(data);
  }

  useEffect(() => {
    loadTasks();

    const interval = setInterval(loadTasks, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-10 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Agent AI Dashboard</h1>

        <Link
          href="/agent/new-task"
          className="bg-black text-white px-5 py-2 rounded-lg"
        >
          ▶ START TASK
        </Link>

        <Link
          href="/agent/leads"
          className="bg-gray-800 text-white px-5 py-2 rounded-lg"
        >
          ▶ Leads
        </Link>
      </div>

      <table className="w-full border">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-3 border">Task ID</th>
            <th className="p-3 border">Status</th>
            <th className="p-3 border">Leads</th>
            <th className="p-3 border">Created</th>
          </tr>
        </thead>

        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td className="p-3 border font-mono">{task.id}</td>

              <td className="p-3 border">
                <span
                  className={`px-3 py-1 rounded text-sm ${statusColor(task.status)}`}
                >
                  {task.status}
                </span>
              </td>

              <td className="p-3 border">{task.leads_found}</td>

              <td className="p-3 border">{task.created_at}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
