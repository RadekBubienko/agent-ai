"use client";

import { useEffect, useState } from "react";
import AgentPageHeader from "@/components/agent/AgentPageHeader";
import { formatPolishDateTime } from "@/lib/formatPolishDateTime";

type RejectedLead = {
  id: number;
  name: string | null;
  email: string | null;
  website: string | null;
  domain: string | null;
  source: string | null;
  platform: string | null;
  reason: string | null;
  rejected_at: string;
  original_created_at: string | null;
};

function formatReason(reason?: string | null) {
  if (!reason) {
    return "-";
  }

  if (reason === "manual_reject") {
    return "Odrzucony ręcznie";
  }

  return reason;
}

export default function RejectedLeadsPage() {
  const [leads, setLeads] = useState<RejectedLead[]>([]);

  useEffect(() => {
    let active = true;

    async function loadRejectedLeads() {
      const res = await fetch("/api/agent/rejected-leads");
      if (!res.ok || !active) return;

      const data: RejectedLead[] = await res.json();
      if (!active) return;

      setLeads(data);
    }

    void loadRejectedLeads();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <AgentPageHeader
        title="Odrzucone Leady"
        description="Lista leadów usuniętych z aktywnej bazy i zablokowanych przed ponownym importem przez Agenta."
        primaryAction={{
          href: "/agent/leads",
          label: "Wróć do leadów",
        }}
      />

      <div className="mb-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">Łącznie odrzuconych</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">
              {leads.length}
            </p>
          </div>

          <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
            Te rekordy są pomijane przez `dedup` przy kolejnych crawlach.
          </div>
        </div>
      </div>

      <div className="space-y-4 lg:hidden">
        {leads.map((lead) => (
          <article
            key={lead.id}
            className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-4">
              <h2 className="text-base font-semibold text-gray-900">
                {lead.name ?? lead.domain ?? "Bez nazwy"}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Odrzucono: {formatPolishDateTime(lead.rejected_at)}
              </p>
            </div>

            <div className="space-y-3 text-sm text-gray-700">
              <div>
                <p className="text-gray-500">Email</p>
                <p className="mt-1 break-all">{lead.email ?? "-"}</p>
              </div>

              <div>
                <p className="text-gray-500">Website</p>
                <p className="mt-1 break-all">{lead.website ?? "-"}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-gray-50 p-3">
                  <p className="text-gray-500">Platforma</p>
                  <p className="mt-1 font-medium text-gray-900">
                    {lead.platform ?? "-"}
                  </p>
                </div>

                <div className="rounded-2xl bg-gray-50 p-3">
                  <p className="text-gray-500">Powód</p>
                  <p className="mt-1 font-medium text-gray-900">
                    {formatReason(lead.reason)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                  Source: {lead.source ?? "-"}
                </span>
                <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                  Zablokowany
                </span>
              </div>
            </div>
          </article>
        ))}

        {leads.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
            Brak odrzuconych leadów.
          </div>
        ) : null}
      </div>

      <div className="hidden overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm lg:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px]">
            <thead className="bg-gray-50 text-left">
              <tr className="text-sm text-gray-500">
                <th className="px-5 py-4 font-medium">Nazwa</th>
                <th className="px-5 py-4 font-medium">Email</th>
                <th className="px-5 py-4 font-medium">Website</th>
                <th className="px-5 py-4 font-medium">Domena</th>
                <th className="px-5 py-4 font-medium">Platforma</th>
                <th className="px-5 py-4 font-medium">Source</th>
                <th className="px-5 py-4 font-medium">Powód</th>
                <th className="px-5 py-4 font-medium">Odrzucono</th>
                <th className="px-5 py-4 font-medium">Pierwotnie dodany</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {leads.map((lead) => (
                <tr key={lead.id} className="align-top">
                  <td className="px-5 py-4 text-sm font-medium text-gray-900">
                    {lead.name ?? "-"}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-700">
                    {lead.email ?? "-"}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-700">
                    <div className="max-w-[260px] break-words">
                      {lead.website ?? "-"}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-700">
                    {lead.domain ?? "-"}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-700">
                    {lead.platform ?? "-"}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-700">
                    {lead.source ?? "-"}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-700">
                    {formatReason(lead.reason)}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-700">
                    {formatPolishDateTime(lead.rejected_at)}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-700">
                    {formatPolishDateTime(lead.original_created_at)}
                  </td>
                </tr>
              ))}

              {leads.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-5 py-10 text-center text-sm text-gray-500"
                  >
                    Brak odrzuconych leadów.
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
