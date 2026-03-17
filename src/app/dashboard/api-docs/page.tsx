import Link from "next/link";

export default function ApiDocsPage() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold mb-2">API dokumentace</h1>
      <p className="text-text-secondary mb-8">
        Všechny endpointy vyžadují hlavičku <code className="bg-bg-secondary px-1.5 py-0.5 rounded">X-Api-Key</code>.
      </p>

      <DocSection
        method="POST"
        endpoint="/api/v1/shipments"
        title="Registrace zásilky"
        body={`{
  "tracking_number": "RR123456789CZ",
  "recipient_name": "Jan Novák",
  "recipient_city": "Praha",
  "recipient_zip": "11000",
  "recipient_address": "Vodičkova 12",
  "external_order_id": "ORD-2026-001"
}`}
      />

      <DocSection
        method="GET"
        endpoint="/api/v1/shipments/:id"
        title="Detail zásilky + verifikace"
      />

      <DocSection
        method="GET"
        endpoint="/api/v1/shipments"
        title="Seznam zásilek"
        query="?status=delivered&carrier=ceska_posta&search=RR123&page=1&limit=20"
      />

      <DocSection
        method="POST"
        endpoint="/api/v1/webhooks"
        title="Registrace webhook URL"
        body={`{
  "webhook_url": "https://vas-eshop.cz/api/shieldtrack"
}`}
      />

      <DocSection
        method="GET"
        endpoint="/api/v1/stats"
        title="Statistiky shopu"
      />

      <div className="mt-10 p-6 bg-bg-card border border-border rounded-xl">
        <h2 className="text-lg font-semibold mb-3">Příklad volání (cURL)</h2>
        <pre className="text-sm bg-bg-secondary border border-border rounded-lg p-4 overflow-auto text-text-secondary">
{`curl -X POST https://your-domain.com/api/v1/shipments \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: your_api_key" \
  -d '{
    "tracking_number": "RR123456789CZ",
    "recipient_name": "Jan Novák",
    "recipient_city": "Praha",
    "recipient_zip": "11000",
    "recipient_address": "Vodičkova 12"
  }'`}
        </pre>
      </div>

      <div className="mt-6 text-sm text-text-muted">
        Cron endpoint: <code className="bg-bg-secondary px-1.5 py-0.5 rounded">/api/cron/track</code> (každých 15 minut)
      </div>

      <div className="mt-8">
        <Link href="/dashboard" className="text-accent hover:underline">
          ← Zpět do dashboardu
        </Link>
      </div>
    </div>
  );
}

function DocSection({
  method,
  endpoint,
  title,
  body,
  query,
}: {
  method: "GET" | "POST";
  endpoint: string;
  title: string;
  body?: string;
  query?: string;
}) {
  return (
    <div className="mb-6 p-6 bg-bg-card border border-border rounded-xl">
      <div className="flex items-center gap-3 mb-2">
        <span
          className={`text-xs font-bold px-2 py-1 rounded ${
            method === "GET"
              ? "bg-info/20 text-info"
              : "bg-success/20 text-success"
          }`}
        >
          {method}
        </span>
        <code className="text-accent font-mono">{endpoint}</code>
      </div>
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      {query && (
        <p className="text-sm text-text-secondary mb-2">
          Query: <code className="font-mono">{query}</code>
        </p>
      )}
      {body && (
        <>
          <p className="text-sm text-text-secondary mb-2">Request body:</p>
          <pre className="text-sm bg-bg-secondary border border-border rounded-lg p-4 overflow-auto text-text-secondary">
            {body}
          </pre>
        </>
      )}
    </div>
  );
}
