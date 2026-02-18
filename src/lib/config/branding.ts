export const branding = {
  name: "Beachamp Training",
  shortName: "BT",
  sport: "Volleyball",
  tagline: "Elevate Your Volleyball Game",
  description:
    "Professional volleyball coaching for all levels. Join our training groups, improve your skills, and track your progress.",
  meta: {
    title: "Beachamp Training — Volleyball Training Platform",
    description: "Volleyball training management — player portals, coach tools, and admin dashboards all in one place.",
  },
  colors: {
    primary: "#0891B2",
    primaryLight: "#E0F7FA",
    secondary: "#1E3A5F",
    accent: "#F59E0B",
    success: "#10B981",
    warning: "#F59E0B",
    danger: "#EF4444",
    sand: "#F0EBE3",
    sandDark: "#D4C8B8",
    sidebar: "#0C2340",
    brand: {
      player: "#0891B2",
      coach: "#7C3AED",
      admin: "#EF4444",
    },
    surface: {
      bg: "#F7FAFB",
      card: "#FFFFFF",
      border: "#D1E3E8",
    },
    text: {
      primary: "#0F172A",
      muted: "#64748B",
    },
    gradient: {
      primary: "from-cyan-600 to-cyan-400",
      dark: "from-[#0C2340] to-[#1A4065]",
    },
  },
  areas: ["Maadi", "Zamalek", "New Cairo", "6th October", "Heliopolis", "Nasr City", "Mohandessin"],
  levels: [
    { value: "beginner", label: "Beginner" },
    { value: "intermediate", label: "Intermediate" },
    { value: "advanced", label: "Advanced" },
    { value: "professional", label: "Professional" },
  ],
  trainingGoals: [
    "Learn the basics",
    "Improve Fitness",
    "Participate in tournaments",
    "Competitive training",
    "Prepare for a season",
  ],
  packages: [
    { sessions: 1, validityDays: null, validityLabel: null, price: 200 },
    { sessions: 8, validityDays: 30, validityLabel: "1 month", price: 1000 },
    { sessions: 12, validityDays: 45, validityLabel: "45 days", price: 1500 },
    { sessions: 24, validityDays: 90, validityLabel: "3 months", price: 2500 },
  ],
} as const;
