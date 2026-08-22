import type { Config } from "tailwindcss";

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
        midnight: "#f8fafc",
        abyss: "#f1f5f9",
        velvet: "#ffffff",
        aurora: "#111827",
        starlight: "#475569",
        gold: "#2563eb"
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(37,99,235,0.14), 0 18px 45px rgba(15, 23, 42, 0.08)",
        card: "0 18px 45px rgba(15, 23, 42, 0.08)"
      },
      backgroundImage: {
        haze:
          "linear-gradient(145deg, #f8fafc, #ffffff)"
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
