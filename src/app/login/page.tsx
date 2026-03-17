"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase-browser";

function LoginForm() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shopName, setShopName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setIsRegister(params.get("register") === "true");
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isRegister) {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, shopName }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Registrace selhala.");
          return;
        }
        // Přihlásit po registraci
        if (data.session) {
          const supabase = createBrowserClient();
          await supabase.auth.setSession(data.session);
          router.push("/dashboard");
        }
      } else {
        const supabase = createBrowserClient();
        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (authError) {
          setError("Neplatné přihlašovací údaje.");
          return;
        }
        router.push("/dashboard");
      }
    } catch {
      setError("Něco se pokazilo. Zkuste to znovu.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-3xl font-bold tracking-tight inline-block">
            <span className="mr-2">🛡️</span>
            <span className="text-accent">Shield</span>
            <span className="text-text-primary">Track</span>
          </Link>
          <p className="text-text-secondary mt-2">
            {isRegister
              ? "Vytvořte si účet pro váš e-shop"
              : "Přihlaste se do dashboardu"}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-bg-card border border-border rounded-xl p-8 space-y-5"
        >
          {isRegister && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Název e-shopu
              </label>
              <input
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                required
                placeholder="Můj E-shop"
                className="w-full bg-bg-secondary border border-border rounded-lg px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="vas@email.cz"
              className="w-full bg-bg-secondary border border-border rounded-lg px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Heslo
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="••••••••"
              className="w-full bg-bg-secondary border border-border rounded-lg px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          {error && (
            <div className="bg-danger/10 border border-danger/30 text-danger rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-bg-primary font-semibold py-2.5 rounded-lg transition-colors"
          >
            {loading
              ? "Načítání..."
              : isRegister
              ? "Vytvořit účet"
              : "Přihlásit se"}
          </button>

          <div className="text-center text-sm text-text-secondary">
            {isRegister ? (
              <>
                Máte účet?{" "}
                <button
                  type="button"
                  onClick={() => setIsRegister(false)}
                  className="text-accent hover:underline"
                >
                  Přihlaste se
                </button>
              </>
            ) : (
              <>
                Nemáte účet?{" "}
                <button
                  type="button"
                  onClick={() => setIsRegister(true)}
                  className="text-accent hover:underline"
                >
                  Zaregistrujte se
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
