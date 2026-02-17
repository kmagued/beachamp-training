import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sports Academy — Management Platform",
  description:
    "Player portals, coach tools, and admin dashboards — all in one place.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-surface-bg text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
