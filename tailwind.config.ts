import type { Config } from 'tailwindcss';

// Brand tokens per PRD §5.1 / v3.0 Tech Stack: Inter (body) + Bricolage
// Grotesque (display), pitch-green accent, near-black dark theme.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pitch: {
          DEFAULT: '#16a34a',
          dark: '#0f7a38',
          light: '#22c55e',
        },
        ink: {
          DEFAULT: '#0a0a0a',
          soft: '#1a1a1a',
        },
      },
      fontFamily: {
        display: ['var(--font-bricolage)', 'sans-serif'],
        body: ['var(--font-inter)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
