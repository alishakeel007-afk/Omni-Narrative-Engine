import type { Config } from "tailwindcss";

// One accent at every weight. Neutral text keeps contrast on light surfaces.
const accent = Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((shade) => [shade, "rgb(var(--brand-accent-rgb) / <alpha-value>)"]));
const neutral = { 50: "#fafafa", 100: "#f5f5f5", 200: "#e5e5e5", 300: "#d4d4d4", 400: "#a3a3a3", 500: "#737373", 600: "#525252", 700: "#404040", 800: "#262626", 900: "#171717", 950: "#0a0a0a" };

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./screens/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        green: accent, emerald: accent, teal: accent, lime: accent,
        blue: accent, cyan: accent, purple: accent, violet: accent, indigo: accent, sky: accent,
        slate: neutral, gray: neutral, zinc: neutral, stone: neutral,
        red: neutral, rose: neutral, pink: neutral, fuchsia: neutral, amber: neutral, orange: neutral, yellow: neutral,
        midnight: "#fafafa",
        abyss: "#f5f5f5",
        velvet: "#ffffff",
        aurora: "#161616",
        starlight: "#6b6b6b",
        gold: "rgb(var(--brand-accent-rgb) / <alpha-value>)",
        accent: "rgb(var(--brand-accent-rgb) / <alpha-value>)"
      },
      boxShadow: {
        glow: "0 0 0 1px rgb(var(--brand-accent-rgb) / 0.14), 0 18px 45px rgba(0, 0, 0, 0.08)",
        card: "0 18px 45px rgba(0, 0, 0, 0.08)"
      },
      backgroundImage: {
        haze:
          "linear-gradient(145deg, #fafafa, #ffffff)"
      },
      animation: {
        float: "float 8s ease-in-out infinite",
        pulseSlow: "pulseSlow 2.5s ease-in-out infinite",
        shimmer: "shimmer 2.8s linear infinite"
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" }
        },
        pulseSlow: {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" }
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" }
        }
      }
    }
  },
  plugins: []
};

export default config;
