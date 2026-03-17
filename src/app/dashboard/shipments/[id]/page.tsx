"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase-browser";
import type { Shipment, TrackingEvent, VerificationResult } from "@/lib/types";

const STATUS_LABELS: Record<string, string> = {
  registered: "Registrovaná",
  in_transit: "V přepravě",
  out_for_delivery: "Na rozvozu",
  delivered: "Doručena",
  returned: "Vrácena",
  lost: "Ztracena",
  cancelled: "Zrušena",
};

const STATUS_ICONS: Record<string, string> = {
  registered: "📋",
  in_transit: "🚚",
  out_for_delivery: "🏃",
  delivered: "✅",
  returned: "↩️",
  lost: "❌",
  cancelled: "🚫",
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

const CHECK_LABELS: Record<string, string> = {
  tracking_exists: "Tracking číslo existuje",
  tracking_active: "Zásilka je aktivní",
  city_match: "Shoda města doručení",
  zip_match: "Shoda PSČ",
  timeline_valid: "Platná časová osa",
  delivery_confirmed: "Potvrzení doručení",
  photo_verified: "Foto verifikace",
};

const RESULT_ICONS: Record<string, string> = {
  pass: "✅",
  fail: "❌",
  warning: "⚠️",
  pending: "⏳",
};

export default function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [verResults, setVerResults] = useState<VerificationResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createBrowserClient();

      const { data: ship } = await supabase
        .from("st_shipments")
        .select("*")
        .eq("id", id)
        .single();

      if (ship) {
        setShipment(ship as Shipment);

        const { data: ev } = await supabase
          .from("st_tracking_events")
          .select("*")
          .eq("shipment_id", id)
          .order("timestamp", { ascending: false });

        setEvents((ev as TrackingEvent[]) || []);

        const { data: vr } = await supabase
          .from("st_verification_results")
          .select("*")
          .eq("shipment_id", id)
          .order("checked_at", { ascending: false });

        setVerResults((vr as VerificationResult[]) || []);
      }

      setLoading(false);
    }

    load();
  }, [id]);

  if (loading) {
    return <div className="text-center text-text-muted py-12">Načítání...</div>;
  }

  if (!shipment) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-3">🔍</div>
        <p className="text-text-muted">Zásilka nenalezena.</p>
        <Link href="/dashboard/shipments" className="text-accent mt-4 inline-block hover:underline">
          ← Zpět na seznam
        </Link>
      </div>
    );
  }

  // Deduplikace verifikačních výsledků (poslední pro každý check_type)
  const latestChecks = new Map<string, VerificationResult>();
  for (const vr of verResults) {
    if (!latestChecks.has(vr.check_type)) {
      latestChecks.set(vr.check_type, vr);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/dashboard/shipments"
          className="text-text-muted hover:text-text-primary transition-colors"
        >
          ← Zpět
        </Link>
        <span className="text-text-muted">/</span>
        <h1 className="text-2xl font-bold font-mono">{shipment.tracking_number}</h1>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Hlavní info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Status banner */}
          <div className="bg-bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-4 mb-4">
              <span className="text-4xl">
                {STATUS_ICONS[shipment.status] || "📦"}
              </span>
              <div>
                <h2 className="text-xl font-bold">
                  {STATUS_LABELS[shipment.status] || shipment.status}
                </h2>
                <p className="text-text-secondary text-sm">
                  {CARRIER_LABELS[shipment.carrier] || shipment.carrier}
                  {shipment.carrier_status_raw && ` — ${shipment.carrier_status_raw}`}
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <InfoRow label="Příjemce" value={shipment.recipient_name} />
              <InfoRow label="Město" value={shipment.recipient_city} />
              <InfoRow label="PSČ" value={shipment.recipient_zip} />
              <InfoRow label="Adresa" value={shipment.recipient_address} />
              <InfoRow label="Objednávka" value={shipment.external_order_id} />
              <InfoRow
                label="Vytvořeno"
                value={new Date(shipment.created_at).toLocaleString("cs")}
              />
              {shipment.delivered_at && (
                <InfoRow
                  label="Doručeno"
                  value={new Date(shipment.delivered_at).toLocaleString("cs")}
                />
              )}
              {shipment.last_checked_at && (
                <InfoRow
                  label="Poslední kontrola"
                  value={new Date(shipment.last_checked_at).toLocaleString("cs")}
                />
              )}
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-bg-card border border-border rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-4">📍 Timeline</h3>
            {events.length === 0 ? (
              <p className="text-text-muted text-sm">
                Zatím žádné tracking události. Počkejte na další kontrolu.
              </p>
            ) : (
              <div className="space-y-0">
                {events.map((event, i) => (
                  <div key={event.id} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-3 h-3 rounded-full ${
                          i === 0 ? "bg-accent" : "bg-border"
                        }`}
                      />
                      {i < events.length - 1 && (
                        <div className="w-px flex-1 bg-border min-h-8" />
                      )}
                    </div>
                    <div className="pb-6">
                      <p className="text-sm font-medium">
                        {event.description || event.status}
                      </p>
                      <div className="flex gap-4 text-xs text-text-muted mt-1">
                        <span>
                          {new Date(event.timestamp).toLocaleString("cs")}
                        </span>
                        {event.location && <span>📍 {event.location}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Verifikace sidebar */}
        <div className="space-y-6">
          {/* Skóre */}
          <div className="bg-bg-card border border-border rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-4">🛡️ Verifikace</h3>
            <div className="text-center mb-6">
              <div
                className={`text-5xl font-bold ${
                  shipment.verification_score >= 80
                    ? "text-success"
                    : shipment.verification_score >= 40
                    ? "text-warning"
                    : shipment.verification_score > 0
                    ? "text-danger"
                    : "text-text-muted"
                }`}
              >
                {shipment.verification_score}
              </div>
              <div className="text-text-muted text-sm mt-1">z 100 bodů</div>
              {/* Progress bar */}
              <div className="mt-3 bg-bg-secondary rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    shipment.verification_score >= 80
                      ? "bg-success"
                      : shipment.verification_score >= 40
                      ? "bg-warning"
                      : "bg-danger"
                  }`}
                  style={{ width: `${shipment.verification_score}%` }}
                />
              </div>
            </div>

            {/* Jednotlivé checky */}
            <div className="space-y-3">
              {Array.from(latestChecks.entries()).map(([type, check]) => (
                <div
                  key={type}
                  className="flex items-start gap-3 text-sm"
                >
                  <span className="text-lg mt-[-2px]">
                    {RESULT_ICONS[check.result] || "❓"}
                  </span>
                  <div>
                    <p className="font-medium">
                      {CHECK_LABELS[type] || type}
                    </p>
                    {check.details && (
                      <p className="text-text-muted text-xs mt-0.5">
                        {check.details}
                      </p>
                    )}
                  </div>
                </div>
              ))}

              {latestChecks.size === 0 && (
                <p className="text-text-muted text-sm">
                  Zatím neproběhla žádná verifikace. Počkejte na první kontrolu.
                </p>
              )}
            </div>
          </div>

          {/* JSON detail */}
          {shipment.verification_details &&
            Object.keys(shipment.verification_details).length > 0 && (
              <div className="bg-bg-card border border-border rounded-xl p-6">
                <h3 className="text-sm font-semibold mb-3 text-text-secondary">
                  Verifikační detaily
                </h3>
                <pre className="text-xs text-text-muted overflow-auto">
                  {JSON.stringify(shipment.verification_details, null, 2)}
                </pre>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <span className="text-text-muted">{label}:</span>{" "}
      <span className="text-text-primary">{value || "—"}</span>
    </div>
  );
}
