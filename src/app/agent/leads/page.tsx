"use client";

import { useEffect, useState } from "react";
import AgentPageHeader from "@/components/agent/AgentPageHeader";
import { formatPolishDateTime } from "@/lib/formatPolishDateTime";

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

type PageSizeOption = "10" | "25" | "50" | "100" | "all";
type SortOption = "newest" | "oldest";

type AgentLeadResponse = {
  leads: Lead[];
  total: number;
  page: number;
  totalPages: number;
  pageSize: number | "all";
  sort: SortOption;
};

const PAGE_SIZE_OPTIONS: Array<{ value: PageSizeOption; label: string }> = [
  { value: "10", label: "10" },
  { value: "25", label: "25" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
  { value: "all", label: "Wszystkie" },
];

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

function normalizeWebsiteUrl(website: string | null): string | null {
  if (!website) {
    return null;
  }

  if (website.startsWith("http://") || website.startsWith("https://")) {
    return website;
  }

  return `https://${website}`;
}

async function requestAgentLeads(filters: {
  platform: string;
  segment: string;
  page: number;
  pageSize: PageSizeOption;
  sort: SortOption;
}): Promise<AgentLeadResponse | null> {
  const params = new URLSearchParams({
    page: String(filters.page),
    pageSize: filters.pageSize,
    sort: filters.sort,
  });

  if (filters.platform) {
    params.append("platform", filters.platform);
  }

  if (filters.segment) {
    params.append("segment", filters.segment);
  }

  const res = await fetch(`/api/agent/leads?${params.toString()}`);

  if (!res.ok) {
    return null;
  }

  return (await res.json()) as AgentLeadResponse;
}

export default function AgentLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [platform, setPlatform] = useState("");
  const [segment, setSegment] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>("25");
  const [sortOrder, setSortOrder] = useState<SortOption>("newest");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [rejectingLeadId, setRejectingLeadId] = useState<number | null>(null);
  const [copiedLeadId, setCopiedLeadId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    async function loadLeads(silent = false) {
      if (!silent) {
        setIsLoading(true);
      }

      const data = await requestAgentLeads({
        platform,
        segment,
        page,
        pageSize,
        sort: sortOrder,
      });

      if (!active) {
        return;
      }

      if (!data) {
        if (!silent) {
          setError("Nie udalo sie pobrac leadow.");
          setIsLoading(false);
        }
        return;
      }

      setError("");
      setLeads(data.leads);
      setTotal(data.total);
      setTotalPages(data.totalPages);

      if (page !== data.page) {
        setPage(data.page);
      }

      if (!silent) {
        setIsLoading(false);
      }
    }

    void loadLeads();

    const interval = window.setInterval(() => {
      void loadLeads(true);
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [page, pageSize, platform, segment, sortOrder]);

  async function reloadCurrentPage() {
    setIsLoading(true);

    const data = await requestAgentLeads({
      platform,
      segment,
      page,
      pageSize,
      sort: sortOrder,
    });

    setIsLoading(false);

    if (!data) {
      setError("Nie udalo sie odswiezyc listy leadow.");
      return;
    }

    setError("");
    setLeads(data.leads);
    setTotal(data.total);
    setTotalPages(data.totalPages);
    setPage(data.page);
  }

  async function rejectLead(lead: Lead) {
    const confirmed = window.confirm(
      `Odrzucic lead "${lead.name}" i zablokowac jego ponowny import?`,
    );

    if (!confirmed) {
      return;
    }

    setRejectingLeadId(lead.id);

    try {
      const res = await fetch(`/api/agent/leads/${lead.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Nie udalo sie odrzucic leada");
      }

      await reloadCurrentPage();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nie udalo sie odrzucic leada";

      window.alert(message);
    } finally {
      setRejectingLeadId(null);
    }
  }

  async function copyEmail(lead: Lead) {
    if (!lead.email) {
      return;
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }

      await navigator.clipboard.writeText(lead.email);
      setCopiedLeadId(lead.id);
      window.setTimeout(() => {
        setCopiedLeadId((current) => (current === lead.id ? null : current));
      }, 1800);
    } catch {
      window.alert("Nie udalo sie skopiowac adresu email.");
    }
  }

  const showingAll = pageSize === "all";
  const firstVisibleLead =
    total === 0 || showingAll ? (total === 0 ? 0 : 1) : (page - 1) * Number(pageSize) + 1;
  const lastVisibleLead =
    total === 0 ? 0 : showingAll ? leads.length : firstVisibleLead + leads.length - 1;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <AgentPageHeader
        title="Leady Agenta"
        description="Przegladaj kontakty znalezione przez Agenta, filtruj po platformie i segmentach, ustawiaj kolejnosc oraz wygodnie przegladaj wyniki bez zbyt szerokiej tabeli."
        primaryAction={{
          href: "/agent/new-task",
          label: "Uruchom nowe zadanie",
        }}
      />

      <div className="ui-panel mb-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <label className="space-y-2 text-sm font-medium text-gray-700">
              <span>Platforma</span>
              <select
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-400"
                value={platform}
                onChange={(event) => {
                  setPlatform(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Wszystkie platformy</option>
                <option value="search">Google / Search</option>
                <option value="facebook">Facebook / Own Page</option>
                <option value="facebook_comments">Facebook Comments</option>
                <option value="instagram">Instagram</option>
              </select>
            </label>

            <label className="space-y-2 text-sm font-medium text-gray-700">
              <span>Segment</span>
              <select
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-400"
                value={segment}
                onChange={(event) => {
                  setSegment(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Wszystkie segmenty</option>
                <option value="cold">Cold</option>
                <option value="warm">Warm</option>
                <option value="hot">Hot</option>
              </select>
            </label>

            <label className="space-y-2 text-sm font-medium text-gray-700">
              <span>Sortowanie</span>
              <select
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-400"
                value={sortOrder}
                onChange={(event) => {
                  setSortOrder(event.target.value as SortOption);
                  setPage(1);
                }}
              >
                <option value="newest">Od najnowszych</option>
                <option value="oldest">Od najstarszych</option>
              </select>
            </label>

            <label className="space-y-2 text-sm font-medium text-gray-700">
              <span>Pokaz na stronie</span>
              <select
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-400"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(event.target.value as PageSizeOption);
                  setPage(1);
                }}
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
              <p>Pokazywane rekordy</p>
              <p className="mt-1 text-base font-semibold text-gray-900">
                {total === 0
                  ? "0"
                  : `${firstVisibleLead}-${lastVisibleLead} z ${total}`}
              </p>
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
        </div>
      </div>

      {isLoading && leads.length === 0 ? (
        <div className="ui-panel rounded-3xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
          Ladowanie leadow...
        </div>
      ) : null}

      <div className="space-y-4 lg:hidden">
        {leads.map((lead) => (
          <article
            key={lead.id}
            className="ui-panel rounded-3xl border border-gray-200 bg-white p-5 shadow-sm"
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
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="break-all">{lead.email ?? "-"}</p>
                  {lead.email ? (
                    <button
                      type="button"
                      onClick={() => void copyEmail(lead)}
                      className="ui-pressable rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700"
                    >
                      {copiedLeadId === lead.id ? "Skopiowano" : "Kopiuj"}
                    </button>
                  ) : null}
                </div>
              </div>

              <div>
                <p className="text-gray-500">Website</p>
                {lead.website ? (
                  <a
                    href={normalizeWebsiteUrl(lead.website) ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex break-all text-emerald-700 underline decoration-emerald-200 underline-offset-4 transition hover:text-emerald-800"
                  >
                    {lead.website}
                  </a>
                ) : (
                  <p className="mt-1 break-all">-</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-gray-50 p-3">
                  <p className="text-gray-500">Platforma / source</p>
                  <p className="mt-1 font-medium text-gray-900">
                    {lead.platform ?? "-"} / {lead.source}
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
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${segmentClasses(lead.segment)}`}
                >
                  {lead.segment}
                </span>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => void rejectLead(lead)}
                  disabled={rejectingLeadId === lead.id}
                  className="inline-flex rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {rejectingLeadId === lead.id ? "Odrzucanie..." : "Odrzuc"}
                </button>
              </div>
            </div>
          </article>
        ))}

        {!isLoading && leads.length === 0 ? (
          <div className="ui-panel rounded-3xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
            Brak leadow dla wybranych filtrow.
          </div>
        ) : null}
      </div>

      <div className="hidden lg:block">
        <div className="border border-gray-200 bg-white shadow-sm rounded-none">
          <table className="w-full table-fixed">
            <thead className="bg-gray-50 text-left">
              <tr className="text-sm text-gray-500">
                <th className="w-[18%] px-5 py-4 font-medium">Nazwa</th>
                <th className="w-[28%] px-5 py-4 font-medium">Kontakt</th>
                <th className="w-[14%] px-5 py-4 font-medium">Zrodlo</th>
                <th className="w-[8%] px-5 py-4 font-medium">Score</th>
                <th className="w-[9%] px-5 py-4 font-medium">Segment</th>
                <th className="w-[13%] px-5 py-4 font-medium">Data</th>
                <th className="w-[10%] px-5 py-4 font-medium">Status</th>
                <th className="w-[10%] px-5 py-4 font-medium">Akcje</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {leads.map((lead) => (
                <tr key={lead.id} className="align-top">
                  <td className="px-5 py-4 text-sm font-medium text-gray-900">
                    <div className="break-words">{lead.name}</div>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-700">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="break-all">{lead.email ?? "-"}</div>
                        {lead.email ? (
                          <button
                            type="button"
                            onClick={() => void copyEmail(lead)}
                            className="ui-pressable rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700"
                          >
                            {copiedLeadId === lead.id ? "Skopiowano" : "Kopiuj"}
                          </button>
                        ) : null}
                      </div>
                      <div className="break-all text-gray-500">
                        {lead.website ? (
                          <a
                            href={normalizeWebsiteUrl(lead.website) ?? "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-700 underline decoration-emerald-200 underline-offset-4 transition hover:text-emerald-800"
                          >
                            {lead.website}
                          </a>
                        ) : (
                          "-"
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-700">
                    <div className="space-y-1 break-words">
                      <div className="font-medium text-gray-900">
                        {lead.platform ?? "-"}
                      </div>
                      <div className="text-gray-500">{lead.source}</div>
                    </div>
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
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      onClick={() => void rejectLead(lead)}
                      disabled={rejectingLeadId === lead.id}
                      className="inline-flex rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {rejectingLeadId === lead.id ? "Odrzucanie..." : "Odrzuc"}
                    </button>
                  </td>
                </tr>
              ))}

              {!isLoading && leads.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-10 text-center text-sm text-gray-500"
                  >
                    Brak leadow dla wybranych filtrow.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 border-t border-gray-200 pt-4 md:flex-row md:items-center md:justify-between">
        <div className="text-sm text-gray-500">
          {showingAll
            ? "Pokazujesz wszystkie leady na jednej stronie."
            : `Strona ${page} z ${totalPages}.`}
        </div>

        {!showingAll ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="ui-pressable rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Poprzednia
            </button>
            <span className="px-2 text-sm text-gray-500">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || isLoading}
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              className="ui-pressable rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Nastepna
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
