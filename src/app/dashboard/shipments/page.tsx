"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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

const CARRIERS = [
  { value: "", label: "Auto-detekce" },
  { value: "ceska_posta", label: "Česká pošta" },
  { value: "zasilkovna", label: "Zásilkovna" },
  { value: "ppl", label: "PPL" },
  { value: "dpd", label: "DPD" },
  { value: "gls", label: "GLS" },
  { value: "balikovna", label: "Balíkovna" },
  { value: "intime", label: "InTime" },
  { value: "geis", label: "Geis" },
  { value: "other", label: "Ostatní" },
];

const PAGE_SIZE = 20;

export default function ShipmentsPage() {
  return (
    <Suspense>
      <ShipmentsContent />
    </Suspense>
  );
}

function ShipmentsContent() {
  const searchParams = useSearchParams();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [carrierFilter, setCarrierFilter] = useState("");
  const [shopId, setShopId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Formulář pro novou zásilku
  const [formData, setFormData] = useState({
    tracking_number: "",
    carrier: "",
    recipient_name: "",
    recipient_city: "",
    recipient_zip: "",
    recipient_address: "",
    external_order_id: "",
  });
  const [formError, setFormError] = useState("");
  const [formSaving, setFormSaving] = useState(false);

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
      const {
        data: { user },
      } = await supabase.auth.getUser();
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

  // Otevřít modal pokud přišel ?new=1
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setShowModal(true);
    }
  }, [searchParams]);

  async function handleCreateShipment(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setFormSaving(true);

    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setFormError("Nepřihlášený uživatel. Přihlaste se znovu.");
        setFormSaving(false);
        return;
      }

      const res = await fetch("/api/dashboard/shipments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          tracking_number: formData.tracking_number,
          carrier: formData.carrier || undefined,
          recipient_name: formData.recipient_name || undefined,
          recipient_city: formData.recipient_city || undefined,
          recipient_zip: formData.recipient_zip || undefined,
          recipient_address: formData.recipient_address || undefined,
          external_order_id: formData.external_order_id || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || "Nepodařilo se vytvořit zásilku.");
        setFormSaving(false);
        return;
      }

      // Úspěch — zavřít modal, reset formulář, reload
      setShowModal(false);
      setFormData({
        tracking_number: "",
        carrier: "",
        recipient_name: "",
        recipient_city: "",
        recipient_zip: "",
        recipient_address: "",
        external_order_id: "",
      });
      loadShipments();
    } catch {
      setFormError("Něco se pokazilo. Zkuste to znovu.");
    } finally {
      setFormSaving(false);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Zásilky</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-accent hover:bg-accent-hover text-bg-primary font-semibold px-5 py-2.5 rounded-lg transition-colors text-sm"
        >
          + Nová zásilka
        </button>
      </div>

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

            {/* Stránkování */}
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

      {/* Modal — Nová zásilka */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />

          {/* Modal obsah */}
          <div className="relative bg-bg-card border border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-lg font-semibold">Nová zásilka</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-text-muted hover:text-text-primary text-xl transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateShipment} className="p-6 space-y-4">
              {/* Tracking číslo */}
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">
                  Tracking číslo <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  value={formData.tracking_number}
                  onChange={(e) =>
                    setFormData({ ...formData, tracking_number: e.target.value })
                  }
                  required
                  placeholder="DR1234567890CZ"
                  className="w-full bg-bg-secondary border border-border rounded-lg px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors font-mono"
                />
              </div>

              {/* Přepravce */}
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">
                  Přepravce
                </label>
                <select
                  value={formData.carrier}
                  onChange={(e) =>
                    setFormData({ ...formData, carrier: e.target.value })
                  }
                  className="w-full bg-bg-secondary border border-border rounded-lg px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent transition-colors"
                >
                  {CARRIERS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-text-muted mt-1">
                  Pokud necháte prázdné, přepravce se detekuje automaticky.
                </p>
              </div>

              {/* Příjemce */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm text-text-secondary mb-1.5">
                    Jméno příjemce
                  </label>
                  <input
                    type="text"
                    value={formData.recipient_name}
                    onChange={(e) =>
                      setFormData({ ...formData, recipient_name: e.target.value })
                    }
                    placeholder="Jan Novák"
                    className="w-full bg-bg-secondary border border-border rounded-lg px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1.5">
                    Město
                  </label>
                  <input
                    type="text"
                    value={formData.recipient_city}
                    onChange={(e) =>
                      setFormData({ ...formData, recipient_city: e.target.value })
                    }
                    placeholder="Praha"
                    className="w-full bg-bg-secondary border border-border rounded-lg px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1.5">
                    PSČ
                  </label>
                  <input
                    type="text"
                    value={formData.recipient_zip}
                    onChange={(e) =>
                      setFormData({ ...formData, recipient_zip: e.target.value })
                    }
                    placeholder="110 00"
                    className="w-full bg-bg-secondary border border-border rounded-lg px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-text-secondary mb-1.5">
                    Adresa
                  </label>
                  <input
                    type="text"
                    value={formData.recipient_address}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        recipient_address: e.target.value,
                      })
                    }
                    placeholder="Hlavní 123"
                    className="w-full bg-bg-secondary border border-border rounded-lg px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                  />
                </div>
              </div>

              {/* ID objednávky */}
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">
                  ID objednávky
                </label>
                <input
                  type="text"
                  value={formData.external_order_id}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      external_order_id: e.target.value,
                    })
                  }
                  placeholder="ORD-12345"
                  className="w-full bg-bg-secondary border border-border rounded-lg px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                />
              </div>

              {/* Chyba */}
              {formError && (
                <div className="bg-danger/10 border border-danger/30 text-danger rounded-lg px-4 py-3 text-sm">
                  {formError}
                </div>
              )}

              {/* Tlačítka */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-bg-secondary border border-border text-text-secondary font-medium py-2.5 rounded-lg hover:border-accent transition-colors"
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="flex-1 bg-accent hover:bg-accent-hover disabled:opacity-50 text-bg-primary font-semibold py-2.5 rounded-lg transition-colors"
                >
                  {formSaving ? "Ukládám..." : "Vytvořit zásilku"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  let color = "text-text-muted bg-bg-secondary";
  if (score >= 80) color = "text-success bg-success/10";
  else if (score >= 40) color = "text-warning bg-warning/10";
  else if (score > 0) color = "text-danger bg-danger/10";

  return (
    <span
      className={`inline-block text-xs font-semibold px-2 py-1 rounded ${color}`}
    >
      {score > 0 ? `${score}` : "—"}
    </span>
  );
}
