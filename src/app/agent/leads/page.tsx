"use client";

import AgentPageHeader from "@/components/agent/AgentPageHeader";
import { formatPolishDateTime } from "@/lib/formatPolishDateTime";
import { useEffect, useState } from "react";

type Lead = {
  id: number;
  name: string;
  email: string | null;
  website: string | null;
  source: string;
  platform: string | null;
  segment: string;
  total_score: number;
  created_at: string;
  status: string;
};

function statusClasses(status: string) {
  if (status === "new") return "bg-sky-100 text-sky-700";
  if (status === "contacted") return "bg-amber-100 text-amber-700";
  if (status === "closed") return "bg-emerald-100 text-emerald-700";

  return "bg-gray-100 text-gray-700";
}

function segmentClasses(segment: string) {
  if (segment === "hot") return "bg-rose-100 text-rose-700";
  if (segment === "warm") return "bg-orange-100 text-orange-700";

  return "bg-slate-100 text-slate-700";
}

export default function AgentLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [platform, setPlatform] = useState("");
  const [segment, setSegment] = useState("");

  useEffect(() => {
    let active = true;

    async function loadLeads() {
      const params = new URLSearchParams();

      if (platform) params.append("platform", platform);
      if (segment) params.append("segment", segment);

      const query = params.toString();
      const res = await fetch(
        query ? `/api/agent/leads?${query}` : "/api/agent/leads",
      );
      if (!res.ok || !active) return;

      const data: Lead[] = await res.json();
      if (!active) return;

      setLeads(data);
    }

    void loadLeads();

    const interval = window.setInterval(() => {
      void loadLeads();
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [platform, segment]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <AgentPageHeader
        title="Leady Agenta"
        description="Przeglądaj kontakty znalezione przez Agenta, filtruj po platformie i segmentach oraz szybko oceniaj jakość wyników."
        primaryAction={{
          href: "/agent/new-task",
          label: "Uruchom nowe zadanie",
        }}
      />

      <div className="mb-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-gray-700">
              <span>Platforma</span>
              <select
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-400"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                <option value="">Wszystkie platformy</option>
                <option value="search">Google / Search</option>
                <option value="facebook">Facebook</option>
                <option value="facebook_comments">Facebook Comments</option>
                <option value="instagram">Instagram</option>
              </select>
            </label>

            <label className="space-y-2 text-sm font-medium text-gray-700">
              <span>Segment</span>
              <select
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-400"
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
              >
                <option value="">Wszystkie segmenty</option>
                <option value="cold">Cold</option>
                <option value="warm">Warm</option>
                <option value="hot">Hot</option>
              </select>
            </label>
          </div>

          <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
            Widoczne rekordy:{" "}
            <span className="font-semibold text-gray-900">{leads.length}</span>
          </div>
        </div>
      </div>

      <div className="space-y-4 lg:hidden">
        {leads.map((lead) => (
          <article
            key={lead.id}
            className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  {lead.name}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {formatPolishDateTime(lead.created_at)}
                </p>
              </div>

              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${statusClasses(lead.status)}`}
              >
                {lead.status}
              </span>
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
                  <p className="text-gray-500">Score</p>
                  <p className="mt-1 font-medium text-gray-900">
                    {lead.total_score}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                  Source: {lead.source}
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${segmentClasses(lead.segment)}`}
                >
                  {lead.segment}
                </span>
              </div>
            </div>
          </article>
        ))}

        {leads.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
            Brak leadów dla wybranych filtrów.
          </div>
        ) : null}
      </div>

      <div className="hidden overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm lg:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px]">
            <thead className="bg-gray-50 text-left">
              <tr className="text-sm text-gray-500">
                <th className="px-5 py-4 font-medium">Nazwa</th>
                <th className="px-5 py-4 font-medium">Email</th>
                <th className="px-5 py-4 font-medium">Website</th>
                <th className="px-5 py-4 font-medium">Platforma</th>
                <th className="px-5 py-4 font-medium">Source</th>
                <th className="px-5 py-4 font-medium">Score</th>
                <th className="px-5 py-4 font-medium">Segment</th>
                <th className="px-5 py-4 font-medium">Data</th>
                <th className="px-5 py-4 font-medium">Status</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {leads.map((lead) => (
                <tr key={lead.id} className="align-top">
                  <td className="px-5 py-4 text-sm font-medium text-gray-900">
                    {lead.name}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-700">
                    {lead.email ?? "-"}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-700">
                    <div className="max-w-[280px] break-words">
                      {lead.website ?? "-"}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-700">
                    {lead.platform ?? "-"}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-700">
                    {lead.source}
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-gray-900">
                    {lead.total_score}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${segmentClasses(lead.segment)}`}
                    >
                      {lead.segment}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-700">
                    {formatPolishDateTime(lead.created_at)}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${statusClasses(lead.status)}`}
                    >
                      {lead.status}
                    </span>
                  </td>
                </tr>
              ))}

              {leads.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-5 py-10 text-center text-sm text-gray-500"
                  >
                    Brak leadów dla wybranych filtrów.
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
