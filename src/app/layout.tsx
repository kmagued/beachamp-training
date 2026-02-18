import type { Metadata, Viewport } from "next";
import { branding } from "@/lib/config/branding";
import "./globals.css";

export const metadata: Metadata = {
  title: branding.meta.title,
  description: branding.meta.description,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
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
