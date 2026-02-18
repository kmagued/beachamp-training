import type { Config } from "tailwindcss";
import { branding } from "./src/lib/config/branding";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        primary: {
          DEFAULT: branding.colors.primary,
          light: branding.colors.primaryLight,
        },
        secondary: branding.colors.secondary,
        accent: branding.colors.accent,
        success: branding.colors.success,
        warning: branding.colors.warning,
        danger: branding.colors.danger,
        sand: {
          DEFAULT: branding.colors.sand,
          dark: branding.colors.sandDark,
        },
        sidebar: branding.colors.sidebar,
        brand: branding.colors.brand,
        surface: branding.colors.surface,
      },
    },
  },
  plugins: [],
};

export default config;
