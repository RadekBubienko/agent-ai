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

type PageSizeOption = "10" | "25" | "50" | "100" | "all";
type SortOption = "newest" | "oldest";

type RejectedLeadResponse = {
  leads: RejectedLead[];
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

function formatReason(reason?: string | null) {
  if (!reason) {
    return "-";
  }

  if (reason === "manual_reject") {
    return "Odrzucony recznie";
  }

  return reason;
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

async function requestRejectedLeads(filters: {
  page: number;
  pageSize: PageSizeOption;
  sort: SortOption;
}): Promise<RejectedLeadResponse | null> {
  const params = new URLSearchParams({
    page: String(filters.page),
    pageSize: filters.pageSize,
    sort: filters.sort,
  });

  const res = await fetch(`/api/agent/rejected-leads?${params.toString()}`);

  if (!res.ok) {
    return null;
  }

  return (await res.json()) as RejectedLeadResponse;
}

export default function RejectedLeadsPage() {
  const [leads, setLeads] = useState<RejectedLead[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>("25");
  const [sortOrder, setSortOrder] = useState<SortOption>("newest");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copiedLeadId, setCopiedLeadId] = useState<number | null>(null);
  const [restoringLeadId, setRestoringLeadId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    async function loadRejectedLeads() {
      setIsLoading(true);

      const data = await requestRejectedLeads({
        page,
        pageSize,
        sort: sortOrder,
      });

      if (!active) {
        return;
      }

      setIsLoading(false);

      if (!data) {
        setError("Nie udalo sie pobrac odrzuconych leadow.");
        return;
      }

      setError("");
      setNotice("");
      setLeads(data.leads);
      setTotal(data.total);
      setTotalPages(data.totalPages);

      if (page !== data.page) {
        setPage(data.page);
      }
    }

    void loadRejectedLeads();

    return () => {
      active = false;
    };
  }, [page, pageSize, sortOrder]);

  async function copyEmail(lead: RejectedLead) {
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

  async function reloadCurrentPage() {
    setIsLoading(true);

    const data = await requestRejectedLeads({
      page,
      pageSize,
      sort: sortOrder,
    });

    setIsLoading(false);

    if (!data) {
      setError("Nie udalo sie odswiezyc listy odrzuconych leadow.");
      return;
    }

    setError("");
    setLeads(data.leads);
    setTotal(data.total);
    setTotalPages(data.totalPages);
    setPage(data.page);
  }

  async function restoreLead(lead: RejectedLead) {
    const confirmed = window.confirm(
      `Przywroc lead "${lead.name ?? lead.domain ?? "bez nazwy"}" do aktywnej bazy?`,
    );

    if (!confirmed) {
      return;
    }

    setRestoringLeadId(lead.id);
    setNotice("");

    try {
      const res = await fetch(`/api/agent/rejected-leads/${lead.id}`, {
        method: "POST",
      });

      const data = (await res.json().catch(() => null)) as
        | { reusedExisting?: boolean; error?: string }
        | null;

      if (!res.ok) {
        throw new Error(data?.error || "Nie udalo sie przywrocic leada");
      }

      await reloadCurrentPage();
      setNotice(
        data?.reusedExisting
          ? "Lead byl juz aktywny, wiec zostal tylko usuniety z Salonu Odrzuconych."
          : "Lead wrocil do aktywnej bazy.",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nie udalo sie przywrocic leada";

      window.alert(message);
    } finally {
      setRestoringLeadId(null);
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
        title="Salon Odrzuconych"
        description="Biznesowy salon leadow usunietych z aktywnej bazy i zablokowanych przed ponownym importem przez Agenta. Tu trzymamy porzadek, zeby dedup nie wpuszczal ich z powrotem."
        primaryAction={{
          href: "/agent/leads",
          label: "Wroc do leadow",
        }}
      />

      <div className="ui-panel mb-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-gray-50 px-4 py-3">
              <p className="text-sm text-gray-500">Lacznie odrzuconych</p>
              <p className="mt-2 text-3xl font-semibold text-gray-900">
                {total}
              </p>
            </div>

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
          </div>

          <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            Pokazywane rekordy:{" "}
            <span className="font-semibold">
              {total === 0
                ? "0"
                : `${firstVisibleLead}-${lastVisibleLead} z ${total}`}
            </span>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {notice}
          </div>
        ) : null}
      </div>

      {isLoading && leads.length === 0 ? (
        <div className="ui-panel rounded-3xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
          Ladowanie odrzuconych leadow...
        </div>
      ) : null}

      <div className="space-y-4 lg:hidden">
        {leads.map((lead) => (
          <article
            key={lead.id}
            className="ui-panel rounded-3xl border border-gray-200 bg-white p-5 shadow-sm"
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
                    {lead.platform ?? "-"} / {lead.source ?? "-"}
                  </p>
                </div>

                <div className="rounded-2xl bg-gray-50 p-3">
                  <p className="text-gray-500">Powod</p>
                  <p className="mt-1 font-medium text-gray-900">
                    {formatReason(lead.reason)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-gray-50 p-3">
                  <p className="text-gray-500">Domena</p>
                  <p className="mt-1 break-all font-medium text-gray-900">
                    {lead.domain ?? "-"}
                  </p>
                </div>

                <div className="rounded-2xl bg-gray-50 p-3">
                  <p className="text-gray-500">Pierwotnie dodany</p>
                  <p className="mt-1 font-medium text-gray-900">
                    {formatPolishDateTime(lead.original_created_at)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                  Zablokowany
                </span>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => void restoreLead(lead)}
                  disabled={restoringLeadId === lead.id}
                  className="ui-pressable inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {restoringLeadId === lead.id ? "Przywracanie..." : "Przywroc"}
                </button>
              </div>
            </div>
          </article>
        ))}

        {!isLoading && leads.length === 0 ? (
          <div className="ui-panel rounded-3xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
            Brak odrzuconych leadow.
          </div>
        ) : null}
      </div>

      <div className="hidden lg:block">
        <div className="overflow-hidden border border-gray-200 bg-white shadow-sm rounded-none">
          <table className="w-full table-fixed">
            <thead className="bg-gray-50 text-left">
              <tr className="text-sm text-gray-500">
                <th className="w-[15%] px-4 py-4 font-medium">Nazwa</th>
                <th className="w-[24%] px-4 py-4 font-medium">Kontakt</th>
                <th className="w-[12%] px-4 py-4 font-medium">Domena</th>
                <th className="w-[11%] px-4 py-4 font-medium">Zrodlo</th>
                <th className="w-[10%] px-4 py-4 font-medium">Powod</th>
                <th className="w-[11%] px-4 py-4 font-medium">Odrzucono</th>
                <th className="w-[11%] px-4 py-4 font-medium">Pierwotnie</th>
                <th className="w-[6%] px-4 py-4 font-medium text-center">Akcje</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {leads.map((lead) => (
                <tr key={lead.id} className="align-top">
                  <td className="px-4 py-4 text-sm font-medium text-gray-900">
                    <div className="break-words">
                      {lead.name ?? lead.domain ?? "-"}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-700">
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
                  <td className="px-4 py-4 text-sm text-gray-700">
                    <div className="break-all">{lead.domain ?? "-"}</div>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-700">
                    <div className="space-y-1 break-words">
                      <div className="font-medium text-gray-900">
                        {lead.platform ?? "-"}
                      </div>
                      <div className="text-gray-500">{lead.source ?? "-"}</div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-700">
                    {formatReason(lead.reason)}
                  </td>
                  <td className="px-4 py-4 text-xs leading-5 text-gray-700">
                    <div className="break-words">
                      {formatPolishDateTime(lead.rejected_at)}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-xs leading-5 text-gray-700">
                    <div className="break-words">
                      {formatPolishDateTime(lead.original_created_at)}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <button
                      type="button"
                      onClick={() => void restoreLead(lead)}
                      disabled={restoringLeadId === lead.id}
                      className="ui-pressable inline-flex whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {restoringLeadId === lead.id ? "Przywracanie..." : "Przywroc"}
                    </button>
                  </td>
                </tr>
              ))}

              {!isLoading && leads.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-sm text-gray-500"
                  >
                    Brak odrzuconych leadow.
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
            ? "Pokazujesz wszystkie odrzucone leady na jednej stronie."
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
