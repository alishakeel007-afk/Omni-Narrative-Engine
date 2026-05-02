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
        midnight: "#06030e",
        abyss: "#090518",
        velvet: "#190a31",
        aurora: "#7c3aed",
        starlight: "#d6bcff",
        gold: "#f472b6"
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(196,181,253,0.18), 0 24px 90px rgba(21, 8, 63, 0.55)",
        card: "0 24px 90px rgba(8, 6, 24, 0.55)"
      },
      backgroundImage: {
        haze:
          "radial-gradient(circle at top, rgba(168,85,247,0.16), transparent 30%), radial-gradient(circle at 20% 20%, rgba(196,181,253,0.12), transparent 30%), linear-gradient(145deg, rgba(12,6,24,0.96), rgba(7,4,18,1))"
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
