export const branding = {
  name: "Beachamp Academy",
  shortName: "BT",
  sport: "Volleyball",
  tagline: "Elevate Your Volleyball Game",
  description:
    "Professional volleyball coaching for all levels. Join our academy groups, improve your skills, and track your progress.",
  meta: {
    title: "Beachamp Academy — Volleyball academy Platform",
    description: "Volleyball academy management — player portals, coach tools, and admin dashboards all in one place.",
  },
  colors: {
    // Core palette: #124b5d (primary), #5cacb0 (secondary), #f7ac40 (accent), #f6efda (sand)
    // Dark tones:   #0c313a,           #1596b5,             #e8901a,          #eddcb2
    primary: {
      50: "#E7F0F3",
      100: "#C4D8DE",
      200: "#9DBDC7",
      300: "#75A2B0",
      400: "#588E9E",
      500: "#2A6577",
      600: "#1D5868",
      700: "#174F60",
      800: "#124B5D",
      900: "#0C313A",
      DEFAULT: "#124B5D",
    },
    accent: {
      50: "#FEF6E8",
      100: "#FDE9C5",
      200: "#FBD89E",
      300: "#F9C677",
      400: "#F8B958",
      500: "#F7AC40",
      600: "#E8901A",
      700: "#C47C19",
      DEFAULT: "#F7AC40",
    },
    secondary: {
      DEFAULT: "#5CACB0",
      dark: "#1596B5",
    },
    success: "#10B981",
    warning: "#F7AC40",
    danger: "#EF4444",
    sand: "#F6EFDA",
    sandDark: "#EDDCB2",
    sidebar: "#124B5D",
    brand: {
      player: "#124B5D",
      coach: "#5CACB0",
      admin: "#F7AC40",
    },
    surface: {
      bg: "#FFFFFF",
      card: "#FFFFFF",
      border: "#C4D8DE",
    },
    text: {
      primary: "#0C313A",
      muted: "#5A6B73",
    },
    gradient: {
      primary: "from-[#124B5D] to-[#5CACB0]",
      dark: "from-[#0C313A] to-[#124B5D]",
    },
  },
  areas: ["Maadi", "Zamalek", "New Cairo", "6th October", "Heliopolis", "Nasr City", "Mohandessin", "El Shorouk"],
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
} as const;
