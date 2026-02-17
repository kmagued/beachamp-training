import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        sidebar: "#0F172A",
        brand: {
          player: "#3B82F6",
          coach: "#8B5CF6",
          admin: "#EF4444",
        },
        surface: {
          bg: "#F8FAFC",
          card: "#FFFFFF",
          border: "#E2E8F0",
        },
      },
    },
  },
  plugins: [],
};

export default config;
