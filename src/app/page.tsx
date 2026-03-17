import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Navbar */}
      <nav className="border-b border-border px-6 py-4">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold tracking-tight">
            <span className="mr-2">🛡️</span>
            <span className="text-accent">Shield</span>
            <span className="text-text-primary">Track</span>
          </Link>
          <div className="flex gap-4 items-center">
            <Link
              href="/login"
              className="text-text-secondary hover:text-text-primary transition-colors"
            >
              Přihlášení
            </Link>
            <Link
              href="/login?register=true"
              className="bg-accent hover:bg-accent-hover text-bg-primary font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              Začít zdarma
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-24 px-6">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
            Ověřte doručení{" "}
            <span className="text-accent">každé zásilky</span>
          </h1>
          <p className="text-xl text-text-secondary mb-10 max-w-2xl mx-auto">
            ShieldTrack automaticky sleduje zásilky u českých přepravců a ověřuje,
            že balík opravdu dorazil na správnou adresu. Ochrana proti podvodům
            s doručením pro e-shopy.
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/login?register=true"
              className="bg-accent hover:bg-accent-hover text-bg-primary font-semibold px-8 py-3 rounded-lg text-lg transition-colors"
            >
              Vyzkoušet zdarma
            </Link>
            <Link
              href="/dashboard/api-docs"
              className="border border-border hover:border-accent text-text-primary px-8 py-3 rounded-lg text-lg transition-colors"
            >
              API dokumentace
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 border-t border-border">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold text-center mb-16">
            Jak to funguje
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon="📦"
              title="1. Registrace zásilky"
              description="Přes API zaregistrujete zásilku s tracking číslem a adresou příjemce. ShieldTrack automaticky rozpozná přepravce."
            />
            <FeatureCard
              icon="🔍"
              title="2. Automatické sledování"
              description="Každých 15 minut kontrolujeme stav u přepravce — Česká pošta, Zásilkovna, PPL, DPD, GLS a další."
            />
            <FeatureCard
              icon="✅"
              title="3. Verifikace doručení"
              description="Multi-faktorové ověření: shoda města, PSČ, platnost timeline, potvrzení od přepravce. Skóre 0-100."
            />
          </div>
        </div>
      </section>

      {/* Carriers */}
      <section className="py-20 px-6 bg-bg-secondary">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold text-center mb-12">
            Podporovaní přepravci
          </h2>
          <div className="flex flex-wrap justify-center gap-6">
            {[
              "Česká pošta",
              "Zásilkovna",
              "PPL",
              "DPD",
              "GLS",
              "Balíkovna",
              "InTime",
              "Geis",
            ].map((carrier) => (
              <div
                key={carrier}
                className="bg-bg-card border border-border rounded-lg px-6 py-3 text-text-secondary"
              >
                {carrier}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-6 border-t border-border">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-3xl font-bold text-center mb-12">Ceník</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <PricingCard
              name="Start"
              price="Zdarma"
              description="Pro začínající e-shopy"
              features={[
                "100 zásilek / měsíc",
                "3 přepravci",
                "Základní verifikace",
                "API přístup",
              ]}
            />
            <PricingCard
              name="Business"
              price="990 Kč"
              period="/měsíc"
              description="Pro rostoucí e-shopy"
              features={[
                "5 000 zásilek / měsíc",
                "Všichni přepravci",
                "Plná verifikace",
                "Webhooky",
                "Prioritní podpora",
              ]}
              highlighted
            />
            <PricingCard
              name="Enterprise"
              price="Na míru"
              description="Pro velké hráče"
              features={[
                "Neomezené zásilky",
                "Vlastní integrace",
                "SLA garance",
                "Dedikovaný účet",
              ]}
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-6">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-text-muted">
            © 2025 ShieldTrack. Všechna práva vyhrazena.
          </div>
          <div className="flex gap-6 text-text-secondary">
            <Link href="/dashboard/api-docs" className="hover:text-accent transition-colors">
              API
            </Link>
            <a href="mailto:info@shieldtrack.cz" className="hover:text-accent transition-colors">
              Kontakt
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-bg-card border border-border rounded-xl p-8 hover:border-accent-border transition-colors">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-xl font-semibold mb-3">{title}</h3>
      <p className="text-text-secondary leading-relaxed">{description}</p>
    </div>
  );
}

function PricingCard({
  name,
  price,
  period,
  description,
  features,
  highlighted,
}: {
  name: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  highlighted?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-8 border ${
        highlighted
          ? "bg-accent-light border-accent"
          : "bg-bg-card border-border"
      }`}
    >
      <h3 className="text-lg font-semibold mb-1">{name}</h3>
      <p className="text-text-muted text-sm mb-4">{description}</p>
      <div className="mb-6">
        <span className="text-3xl font-bold">{price}</span>
        {period && <span className="text-text-secondary">{period}</span>}
      </div>
      <ul className="space-y-2">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-text-secondary">
            <span className="text-accent">✓</span>
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}
