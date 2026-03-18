"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";

export default function SettingsPage() {
  const [shopId, setShopId] = useState<string | null>(null);
  const [shopName, setShopName] = useState("");
  const [domain, setDomain] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: shop } = await supabase
        .from("st_shops")
        .select("id, name, domain, webhook_url, api_key")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (shop) {
        setShopId(shop.id);
        setShopName(shop.name || "");
        setDomain(shop.domain || "");
        setWebhookUrl(shop.webhook_url || "");
        setApiKey(shop.api_key || "");
      }

      setLoading(false);
    }

    loadSettings();
  }, []);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!shopId) return;

    setSaving(true);
    setMessage("");

    const supabase = createBrowserClient();
    const { error } = await supabase
      .from("st_shops")
      .update({
        name: shopName,
        domain: domain || null,
        webhook_url: webhookUrl || null,
      })
      .eq("id", shopId);

    if (error) {
      setMessage("❌ Nepodařilo se uložit nastavení.");
    } else {
      setMessage("✅ Nastavení uloženo.");
    }

    setSaving(false);
  }

  async function regenerateApiKey() {
    if (!shopId) return;
    if (
      !confirm(
        "Opravdu chcete vygenerovat nový API klíč? Starý přestane ihned fungovat."
      )
    )
      return;

    const newKey =
      crypto.randomUUID().replaceAll("-", "") +
      crypto.randomUUID().replaceAll("-", "");

    const supabase = createBrowserClient();
    const { error } = await supabase
      .from("st_shops")
      .update({ api_key: newKey })
      .eq("id", shopId);

    if (error) {
      setMessage("❌ Nepodařilo se vygenerovat nový API klíč.");
    } else {
      setApiKey(newKey);
      setMessage("✅ API klíč byl vygenerován.");
    }
  }

  async function copyApiKey() {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const el = document.createElement("textarea");
      el.value = apiKey;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (loading) {
    return <div className="text-text-muted">Načítání...</div>;
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Nastavení shopu</h1>

      <form
        onSubmit={saveSettings}
        className="bg-bg-card border border-border rounded-xl p-6 space-y-5"
      >
        <div>
          <label className="block text-sm text-text-secondary mb-1.5">
            Název shopu
          </label>
          <input
            type="text"
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            required
            className="w-full bg-bg-secondary border border-border rounded-lg px-4 py-2.5 focus:outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1.5">
            Doména
          </label>
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="eshop.cz"
            className="w-full bg-bg-secondary border border-border rounded-lg px-4 py-2.5 focus:outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1.5">
            Webhook URL
          </label>
          <input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://vas-eshop.cz/api/shieldtrack-webhook"
            className="w-full bg-bg-secondary border border-border rounded-lg px-4 py-2.5 focus:outline-none focus:border-accent"
          />
          <p className="text-xs text-text-muted mt-1">
            Notifikace posíláme při změně stavu zásilky.
          </p>
        </div>

        <div>
          <label className="block text-sm text-text-secondary mb-1.5">
            API klíč
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={apiKey}
              readOnly
              className="flex-1 bg-bg-secondary border border-border rounded-lg px-4 py-2.5 font-mono text-sm text-text-secondary"
            />
            <button
              type="button"
              onClick={copyApiKey}
              className="bg-bg-secondary border border-border text-text-secondary px-4 py-2.5 rounded-lg text-sm hover:border-accent hover:text-accent transition-colors whitespace-nowrap"
            >
              {copied ? "✓ Zkopírováno" : "📋 Kopírovat"}
            </button>
            <button
              type="button"
              onClick={regenerateApiKey}
              className="bg-warning/20 border border-warning/40 text-warning px-4 py-2.5 rounded-lg text-sm hover:bg-warning/30 transition-colors whitespace-nowrap"
            >
              Regenerovat
            </button>
          </div>
          <p className="text-xs text-text-muted mt-1">
            Použijte tento klíč v headeru X-Api-Key při volání API.
          </p>
        </div>

        {message && (
          <div className="text-sm text-text-secondary">{message}</div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-bg-primary font-semibold px-6 py-2.5 rounded-lg transition-colors"
        >
          {saving ? "Ukládám..." : "Uložit změny"}
        </button>
      </form>
    </div>
  );
}
