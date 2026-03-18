"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase-browser";
import type { Shipment, ShopStats } from "@/lib/types";

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
  registered: "text-info",
  in_transit: "text-warning",
  out_for_delivery: "text-accent",
  delivered: "text-success",
  returned: "text-danger",
  lost: "text-danger",
  cancelled: "text-text-muted",
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

export default function DashboardPage() {
  const [stats, setStats] = useState<ShopStats | null>(null);
  const [recentShipments, setRecentShipments] = useState<Shipment[]>([]);
  const [shipments30d, setShipments30d] = useState<{ date: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Načíst shop
      const { data: shops } = await supabase
        .from("st_shops")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (!shops || shops.length === 0) {
        setLoading(false);
        return;
      }

      const shopId = shops[0].id;

      // Statistiky
      const { count: totalShipments } = await supabase
        .from("st_shipments")
        .select("*", { count: "exact", head: true })
        .eq("shop_id", shopId);

      const { data: avgData } = await supabase
        .from("st_shipments")
        .select("verification_score")
        .eq("shop_id", shopId)
        .gt("verification_score", 0);

      const avgScore =
        avgData && avgData.length > 0
          ? Math.round(
              avgData.reduce((s, r) => s + (r.verification_score || 0), 0) /
                avgData.length
            )
          : 0;

      const { count: deliveredCount } = await supabase
        .from("st_shipments")
        .select("*", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .eq("status", "delivered");

      const deliveredPercent =
        totalShipments && totalShipments > 0
          ? Math.round(((deliveredCount || 0) / totalShipments) * 100)
          : 0;

      setStats({
        totalShipments: totalShipments || 0,
        avgScore,
        deliveredPercent,
        avgDeliveryDays: 0,
      });

      // Poslední zásilky
      const { data: shipments } = await supabase
        .from("st_shipments")
        .select("*")
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false })
        .limit(10);

      setRecentShipments((shipments as Shipment[]) || []);

      // Pseudo-graf za 30 dní (počty registrací)
      const days: { date: string; count: number }[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        days.push({ date: key, count: 0 });
      }

      const { data: monthShipments } = await supabase
        .from("st_shipments")
        .select("created_at")
        .eq("shop_id", shopId)
        .gte("created_at", days[0].date + "T00:00:00.000Z")
        .order("created_at", { ascending: true });

      for (const row of monthShipments || []) {
        const key = new Date(row.created_at).toISOString().slice(0, 10);
        const day = days.find((d) => d.date === key);
        if (day) day.count += 1;
      }

      setShipments30d(days);
      setLoading(false);
    }

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-text-muted">Načítání...</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Přehled</h1>

      {/* Stats karty */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Celkem zásilek"
          value={String(stats?.totalShipments || 0)}
          icon="📦"
        />
        <StatCard
          label="Průměrné skóre"
          value={`${stats?.avgScore || 0}/100`}
          icon="🛡️"
          accent
        />
        <StatCard
          label="Doručeno"
          value={`${stats?.deliveredPercent || 0}%`}
          icon="✅"
        />
        <StatCard
          label="Průměrná doba"
          value={`${stats?.avgDeliveryDays || 0} dní`}
          icon="⏱️"
        />
      </div>

      {/* Graf za 30 dní */}
      <div className="bg-bg-card border border-border rounded-xl p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">Zásilky za posledních 30 dní</h2>
        {shipments30d.length === 0 ? (
          <p className="text-sm text-text-muted">Žádná data.</p>
        ) : (
          <div className="flex items-end gap-1 h-40">
            {shipments30d.map((d) => {
              const max = Math.max(...shipments30d.map((x) => x.count), 1);
              const h = Math.max(4, (d.count / max) * 100);
              return (
                <div key={d.date} className="flex-1 group relative">
                  <div
                    className="w-full bg-accent/70 hover:bg-accent rounded-t transition-colors"
                    style={{ height: `${h}%` }}
                    title={`${d.date}: ${d.count}`}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Poslední zásilky */}
      <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold">Poslední zásilky</h2>
          <Link
            href="/dashboard/shipments"
            className="text-accent text-sm hover:underline"
          >
            Zobrazit vše →
          </Link>
        </div>

        {recentShipments.length === 0 ? (
          <div className="p-12 text-center text-text-muted">
            <div className="text-4xl mb-3">📭</div>
            <p>Zatím žádné zásilky.</p>
            <p className="text-sm mt-1">
              Použijte API pro registraci první zásilky.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-text-muted text-sm border-b border-border">
                  <th className="px-6 py-3 font-medium">Tracking</th>
                  <th className="px-6 py-3 font-medium">Přepravce</th>
                  <th className="px-6 py-3 font-medium">Příjemce</th>
                  <th className="px-6 py-3 font-medium">Stav</th>
                  <th className="px-6 py-3 font-medium">Skóre</th>
                  <th className="px-6 py-3 font-medium">Datum</th>
                </tr>
              </thead>
              <tbody>
                {recentShipments.map((s) => (
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
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary">
                      {CARRIER_LABELS[s.carrier] || s.carrier}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {s.recipient_name || "—"}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`text-sm font-medium ${
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
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-text-muted text-sm">{label}</span>
        <span className="text-xl">{icon}</span>
      </div>
      <div
        className={`text-2xl font-bold ${
          accent ? "text-accent" : "text-text-primary"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  let color = "text-text-muted";
  if (score >= 80) color = "text-success";
  else if (score >= 40) color = "text-warning";
  else if (score > 0) color = "text-danger";

  return (
    <span className={`text-sm font-semibold ${color}`}>
      {score > 0 ? `${score}%` : "—"}
    </span>
  );
}
