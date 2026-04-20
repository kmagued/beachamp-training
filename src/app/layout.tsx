import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { branding } from "@/lib/config/branding";
import "./globals.css";

const montserrat = localFont({
  src: [
    { path: "../../public/fonts/Montserrat-Thin.ttf", weight: "100", style: "normal" },
    { path: "../../public/fonts/Montserrat-ThinItalic.ttf", weight: "100", style: "italic" },
    { path: "../../public/fonts/Montserrat-ExtraLight.ttf", weight: "200", style: "normal" },
    { path: "../../public/fonts/Montserrat-ExtraLightItalic.ttf", weight: "200", style: "italic" },
    { path: "../../public/fonts/Montserrat-Light.ttf", weight: "300", style: "normal" },
    { path: "../../public/fonts/Montserrat-LightItalic.ttf", weight: "300", style: "italic" },
    { path: "../../public/fonts/Montserrat-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../public/fonts/Montserrat-Italic.ttf", weight: "400", style: "italic" },
    { path: "../../public/fonts/Montserrat-Medium.ttf", weight: "500", style: "normal" },
    { path: "../../public/fonts/Montserrat-MediumItalic.ttf", weight: "500", style: "italic" },
    { path: "../../public/fonts/Montserrat-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "../../public/fonts/Montserrat-SemiBoldItalic.ttf", weight: "600", style: "italic" },
    { path: "../../public/fonts/Montserrat-Bold.ttf", weight: "700", style: "normal" },
    { path: "../../public/fonts/Montserrat-BoldItalic.ttf", weight: "700", style: "italic" },
    { path: "../../public/fonts/Montserrat-ExtraBold.ttf", weight: "800", style: "normal" },
    { path: "../../public/fonts/Montserrat-ExtraBoldItalic.ttf", weight: "800", style: "italic" },
    { path: "../../public/fonts/Montserrat-Black.ttf", weight: "900", style: "normal" },
    { path: "../../public/fonts/Montserrat-BlackItalic.ttf", weight: "900", style: "italic" },
  ],
  variable: "--font-montserrat",
  display: "swap",
});

const bebasNeue = localFont({
  src: "../../public/fonts/BebasNeue-Regular.ttf",
  variable: "--font-bebas-neue",
  display: "swap",
  weight: "400",
});

export const metadata: Metadata = {
  title: branding.meta.title,
  description: branding.meta.description,
  icons: {
    icon: "/images/favicon.png",
    shortcut: "/images/favicon.png",
    apple: "/images/favicon.png",
  },
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
    <html lang="en" className={`${montserrat.variable} ${bebasNeue.variable}`}>
      <body className="bg-surface-bg text-slate-900 antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
