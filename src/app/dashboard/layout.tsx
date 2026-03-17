"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";

const navItems = [
  { href: "/dashboard", label: "Přehled", icon: "📊" },
  { href: "/dashboard/shipments", label: "Zásilky", icon: "📦" },
  { href: "/dashboard/settings", label: "Nastavení", icon: "⚙️" },
  { href: "/dashboard/api-docs", label: "API Docs", icon: "📖" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [shopName, setShopName] = useState("Načítání...");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    async function loadShop() {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data: shops } = await supabase
        .from("st_shops")
        .select("name")
        .eq("user_id", user.id)
        .limit(1);

      if (shops && shops.length > 0) {
        setShopName(shops[0].name);
      } else {
        setShopName("Nový shop");
      }
    }
    loadShop();
  }, [router]);

  async function handleLogout() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-bg-primary flex">
      {/* Sidebar - desktop */}
      <aside className="hidden md:flex w-64 bg-bg-secondary border-r border-border flex-col">
        <div className="p-6 border-b border-border">
          <Link href="/" className="text-xl font-bold tracking-tight">
            <span className="mr-1.5">🛡️</span>
            <span className="text-accent">Shield</span>
            <span className="text-text-primary">Track</span>
          </Link>
          <p className="text-text-muted text-sm mt-1 truncate">{shopName}</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-accent-light text-accent border border-accent-border"
                    : "text-text-secondary hover:text-text-primary hover:bg-bg-card"
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
          >
            <span>🚪</span>
            Odhlásit se
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex-1 flex flex-col">
        <header className="md:hidden flex items-center justify-between border-b border-border px-4 py-3">
          <Link href="/" className="text-lg font-bold">
            <span className="mr-1">🛡️</span>
            <span className="text-accent">Shield</span>Track
          </Link>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-text-secondary p-2"
          >
            {mobileMenuOpen ? "✕" : "☰"}
          </button>
        </header>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-bg-secondary border-b border-border p-4 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm text-text-secondary hover:text-text-primary"
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            ))}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm text-text-secondary hover:text-danger"
            >
              <span>🚪</span>
              Odhlásit se
            </button>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 p-6 md:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
