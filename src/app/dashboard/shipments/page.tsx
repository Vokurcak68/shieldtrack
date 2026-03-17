"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase-browser";
import type { Shipment } from "@/lib/types";

const STATUS_LABELS: Record<string, string> = {
  registered: "Registrovaná",
  in_transit: "V přepravě",
  out_for_delivery: "Na rozvozu",
  delivered: "Doručena",
  returned: "Vrácena",
  lost: "Ztracena",
  cancelled: "Zrušena",
};

const STATUS_COLORS: Record<string, string> = {
  registered: "bg-info/20 text-info",
  in_transit: "bg-warning/20 text-warning",
  out_for_delivery: "bg-accent/20 text-accent",
  delivered: "bg-success/20 text-success",
  returned: "bg-danger/20 text-danger",
  lost: "bg-danger/20 text-danger",
  cancelled: "bg-bg-secondary text-text-muted",
};

const CARRIER_LABELS: Record<string, string> = {
  ceska_posta: "Česká pošta",
  zasilkovna: "Zásilkovna",
  ppl: "PPL",
  dpd: "DPD",
  gls: "GLS",
  balikovna: "Balíkovna",
  intime: "InTime",
  geis: "Geis",
  other: "Ostatní",
};

const PAGE_SIZE = 20;

export default function ShipmentsPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [carrierFilter, setCarrierFilter] = useState("");
  const [shopId, setShopId] = useState<string | null>(null);

  const loadShipments = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    const supabase = createBrowserClient();
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("st_shipments")
      .select("*", { count: "exact" })
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (statusFilter) query = query.eq("status", statusFilter);
    if (carrierFilter) query = query.eq("carrier", carrierFilter);
    if (search) {
      query = query.or(
        `tracking_number.ilike.%${search}%,recipient_name.ilike.%${search}%,external_order_id.ilike.%${search}%`
      );
    }

    const { data, count } = await query;
    setShipments((data as Shipment[]) || []);
    setTotal(count || 0);
    setLoading(false);
  }, [shopId, page, statusFilter, carrierFilter, search]);

  useEffect(() => {
    async function init() {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: shops } = await supabase
        .from("st_shops")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (shops && shops.length > 0) {
        setShopId(shops[0].id);
      }
    }
    init();
  }, []);

  useEffect(() => {
    if (shopId) loadShipments();
  }, [shopId, loadShipments]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Zásilky</h1>

      {/* Filtry */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          placeholder="Hledat (tracking, příjemce, objednávka)..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="flex-1 bg-bg-card border border-border rounded-lg px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="bg-bg-card border border-border rounded-lg px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent"
        >
          <option value="">Všechny stavy</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={carrierFilter}
          onChange={(e) => {
            setCarrierFilter(e.target.value);
            setPage(1);
          }}
          className="bg-bg-card border border-border rounded-lg px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent"
        >
          <option value="">Všichni přepravci</option>
          {Object.entries(CARRIER_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {/* Tabulka */}
      <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-text-muted">Načítání...</div>
        ) : shipments.length === 0 ? (
          <div className="p-12 text-center text-text-muted">
            <div className="text-4xl mb-3">📭</div>
            <p>Žádné zásilky odpovídající filtrům.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-text-muted text-sm border-b border-border">
                    <th className="px-6 py-3 font-medium">Tracking</th>
                    <th className="px-6 py-3 font-medium">Přepravce</th>
                    <th className="px-6 py-3 font-medium">Příjemce</th>
                    <th className="px-6 py-3 font-medium">Město</th>
                    <th className="px-6 py-3 font-medium">Stav</th>
                    <th className="px-6 py-3 font-medium">Skóre</th>
                    <th className="px-6 py-3 font-medium">Vytvořeno</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-border/50 hover:bg-bg-card-hover transition-colors"
                    >
                      <td className="px-6 py-4">
                        <Link
                          href={`/dashboard/shipments/${s.id}`}
                          className="text-accent hover:underline font-mono text-sm"
                        >
                          {s.tracking_number}
                        </Link>
                        {s.external_order_id && (
                          <div className="text-xs text-text-muted mt-0.5">
                            Obj: {s.external_order_id}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-text-secondary">
                        {CARRIER_LABELS[s.carrier] || s.carrier}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {s.recipient_name || "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-text-secondary">
                        {s.recipient_city || "—"}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${
                            STATUS_COLORS[s.status] || ""
                          }`}
                        >
                          {STATUS_LABELS[s.status] || s.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <ScoreBadge score={s.verification_score} />
                      </td>
                      <td className="px-6 py-4 text-sm text-text-muted">
                        {new Date(s.created_at).toLocaleDateString("cs")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                <span className="text-sm text-text-muted">
                  {total} zásilek celkem
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-sm bg-bg-secondary border border-border rounded-lg disabled:opacity-30 hover:border-accent transition-colors"
                  >
                    ← Předchozí
                  </button>
                  <span className="px-3 py-1.5 text-sm text-text-secondary">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 text-sm bg-bg-secondary border border-border rounded-lg disabled:opacity-30 hover:border-accent transition-colors"
                  >
                    Další →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  let color = "text-text-muted bg-bg-secondary";
  if (score >= 80) color = "text-success bg-success/10";
  else if (score >= 40) color = "text-warning bg-warning/10";
  else if (score > 0) color = "text-danger bg-danger/10";

  return (
    <span className={`inline-block text-xs font-semibold px-2 py-1 rounded ${color}`}>
      {score > 0 ? `${score}` : "—"}
    </span>
  );
}
