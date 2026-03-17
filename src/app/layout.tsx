import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "🛡️ ShieldTrack — Verifikace doručení zásilek",
  description: "SaaS služba pro tracking zásilek a verifikaci doručení. Automatická detekce přepravce, multi-faktorové ověření, dashboard pro e-shopy.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
