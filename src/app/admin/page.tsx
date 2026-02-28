"use client";

import { useEffect, useState } from "react";

type Lead = {
  id: number;
  name: string;
  email: string;
  created_at: string;
  ip_address: string;
  status: string;
};

type Stat = {
  day: string;
  count: number;
};

type StatusStat = {
  status: string;
  count: number;
};

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<Stat[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [statusStats, setStatusStats] = useState<StatusStat[]>([]);
  const [todayNew, setTodayNew] = useState(0);
  const [toFollowUp, setToFollowUp] = useState(0);
  const [ipStats, setIpStats] = useState<any[]>([]);

  const fetchData = async (
    adminToken: string,
    pageNum = 1,
    status = "",
    from = "",
    to = "",
  ) => {
    const params = new URLSearchParams({
      page: String(pageNum),
      search,
    });

    if (status) params.append("status", status);
    if (from && to) {
      params.append("from", from);
      params.append("to", to);
    }

    const res = await fetch(`/api/admin/leads?${params.toString()}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    if (!res.ok) return;

    const data = await res.json();

    setLeads(data.leads);
    setStats(data.stats);
    setStatusStats(data.statusStats);
    setTotal(data.total);
    setPage(data.page);
    setTotalPages(data.totalPages);
    setTodayNew(data.todayNew);
    setToFollowUp(data.toFollowUp);
    setIpStats(data.ipStats);
  };

  useEffect(() => {
    const saved = localStorage.getItem("admin_token");
    if (saved) {
      setToken(saved);
      fetchData(saved);
    }
  }, []);

  const maxDay = Math.max(...stats.map((s) => s.count), 1);

  const exportCSV = async () => {
    const res = await fetch("/api/admin/leads/export", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "leads.csv";
    a.click();
  };

  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  return (
    <div className="min-h-screen bg-gray-100 p-10">
      <div className="max-w-6xl mx-auto bg-white p-6 rounded-xl shadow">
        <h1 className="text-2xl font-bold mb-6">Dashboard Lead Generation</h1>

        {leads.length === 0 && (
          <>
            <input
              type="password"
              placeholder="Token admin"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="border p-2 rounded w-full mb-4"
            />
            <button
              onClick={() => fetchData(token)}
              className="bg-black text-white px-4 py-2 rounded"
            >
              Zaloguj
            </button>
          </>
        )}

        {leads.length > 0 && (
          <>
            {/* KPI */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-gray-100 p-4 rounded">
                <p className="text-sm text-gray-500">Łącznie leadów</p>
                <p className="text-2xl font-bold">{total}</p>
              </div>
              <div className="bg-gray-100 p-4 rounded">
                <p className="text-sm text-gray-500">Strona</p>
                <p className="text-2xl font-bold">{page}</p>
              </div>
              <div className="bg-gray-100 p-4 rounded">
                <p className="text-sm text-gray-500">Maks / dzień</p>
                <p className="text-2xl font-bold">{maxDay}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-8">
              {statusStats.map((s, i) => (
                <div key={i} className="bg-gray-100 p-4 rounded">
                  <p className="text-sm text-gray-500">{s.status}</p>
                  <p className="text-2xl font-bold">{s.count}</p>
                </div>
              ))}
              <div className="bg-red-100 p-4 rounded">
                <p className="text-sm">Nowe dziś</p>
                <p className="text-2xl font-bold">{todayNew}</p>
              </div>
              <div className="bg-yellow-100 p-4 rounded">
                <p className="text-sm">Skontaktowane dziś</p>
                <p className="text-2xl font-bold">{toFollowUp}</p>
              </div>
            </div>

            <button
              onClick={exportCSV}
              className="bg-black text-white px-4 py-2 rounded mb-6 cursor-pointer"
            >
              Eksport CSV
            </button>

            {/* Wykres */}
            <div className="mb-10">
              <h2 className="font-semibold mb-4">Leady / dzień</h2>
              <div className="flex items-end gap-2 h-40">
                {stats.map((s, i) => (
                  <div
                    key={i}
                    className="bg-black w-6"
                    style={{
                      height: `${(s.count / maxDay) * 100}%`,
                    }}
                    title={`${s.day} (${s.count})`}
                  />
                ))}
              </div>
            </div>

            <div className="mb-10">
              <h2 className="font-semibold mb-4">Powtarzające się IP</h2>

              {ipStats.length === 0 && (
                <p className="text-sm text-gray-500">Brak powtarzalnych IP</p>
              )}

              {ipStats.map((ip, i) => (
                <div
                  key={i}
                  className="flex justify-between border-b py-2 text-sm"
                >
                  <span>{ip.ip_address}</span>
                  <span className="font-bold">{ip.count}</span>
                </div>
              ))}
            </div>

            {/* Search */}
            <div className="mb-4 flex gap-2">
              <input
                placeholder="Szukaj email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border p-2 rounded flex-1"
              />
              <button
                onClick={() => fetchData(token)}
                className="bg-black text-white px-4 rounded cursor-pointer"
              >
                Szukaj
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => {
                  setStatusFilter("new");
                  fetchData(token, 1, "new", dateFrom, dateTo);
                }}
                className="px-3 py-1 border rounded cursor-pointer"
              >
                Nowe
              </button>

              <button
                onClick={() => {
                  setStatusFilter("contacted");
                  fetchData(token, 1, "contacted", dateFrom, dateTo);
                }}
                className="px-3 py-1 border rounded cursor-pointer"
              >
                Contacted
              </button>

              <button
                onClick={() => {
                  setStatusFilter("closed");
                  fetchData(token, 1, "closed", dateFrom, dateTo);
                }}
                className="px-3 py-1 border rounded cursor-pointer"
              >
                Closed
              </button>

              <button
                onClick={() => {
                  setStatusFilter("");
                  fetchData(token, 1, "", dateFrom, dateTo);
                }}
                className="px-3 py-1 border rounded cursor-pointer"
              >
                Wszystkie
              </button>
            </div>

            <div className="flex gap-2 mb-6">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="border p-2 rounded"
              />

              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border p-2 rounded"
              />

              <button
                onClick={() =>
                  fetchData(token, 1, statusFilter, dateFrom, dateTo)
                }
                className="px-4 py-2 bg-black text-white rounded cursor-pointer"
              >
                Filtruj
              </button>
            </div>

            {/* Tabela */}
            <table className="w-full border-collapse mb-6">
              <thead>
                <tr className="bg-gray-200 text-left">
                  <th className="p-2">ID</th>
                  <th className="p-2">Imię</th>
                  <th className="p-2">Email</th>
                  <th className="p-2">Data</th>
                  <th className="p-2">IP</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-t">
                    <td className="p-2">{lead.id}</td>
                    <td className="p-2">{lead.name}</td>
                    <td className="p-2">{lead.email}</td>
                    <td className="p-2">
                      {new Date(lead.created_at).toLocaleString()}
                    </td>
                    <td className="p-2">{lead.ip_address}</td>
                    <td className="p-2">
                      <select
                        value={lead.status}
                        onChange={async (e) => {
                          const newStatus = e.target.value;

                          await fetch(`/api/admin/leads/${lead.id}`, {
                            method: "PATCH",
                            headers: {
                              "Content-Type": "application/json",
                              Authorization: `Bearer ${token}`,
                            },
                            body: JSON.stringify({ status: newStatus }),
                          });

                          fetchData(token, page);
                        }}
                        className="border p-1 rounded"
                      >
                        <option value="new">new</option>
                        <option value="contacted">contacted</option>
                        <option value="closed">closed</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Paginacja */}
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() =>
                  fetchData(token, page - 1, statusFilter, dateFrom, dateTo)
                }
              >
                ←
              </button>
              <span className="px-3 py-1">
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() =>
                  fetchData(token, page + 1, statusFilter, dateFrom, dateTo)
                }
              >
                →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
