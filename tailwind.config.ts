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
        midnight: "#030712",
        abyss: "#060b16",
        velvet: "#0b1220",
        aurora: "#111827",
        starlight: "#e5f7ff",
        gold: "#7dd3fc"
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(125,211,252,0.18), 0 24px 70px rgba(0, 0, 0, 0.45)",
        card: "0 24px 70px rgba(0, 0, 0, 0.38)"
      },
      backgroundImage: {
        haze:
          "radial-gradient(circle at top, rgba(125,211,252,0.08), transparent 28%), linear-gradient(145deg, #030712, #060b16)"
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
