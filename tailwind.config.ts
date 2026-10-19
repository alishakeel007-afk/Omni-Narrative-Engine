import type { Config } from "tailwindcss";

/**
 * Tailwind's own palette is left alone.
 *
 * It previously aliased every hue onto the accent so that off-palette classes
 * could not show. That machinery is gone with the screens that needed it: the
 * product's three colours live in `app/globals.css` as `--bg`, `--ink`,
 * `--accent`, `--line` and `--muted`, and components reference those directly.
 * A stray `bg-blue-500` is now visible in review rather than silently recoloured.
 */
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./screens/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      boxShadow: {
        card: "0 18px 45px rgba(0, 0, 0, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
