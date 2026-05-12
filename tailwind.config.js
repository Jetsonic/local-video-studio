/** @type {import('tailwindcss').Config} */
export default {
  content: ['./client/**/*.{vue,ts,html}'],
  theme: {
    extend: {
      colors: {
        surface: '#0f0f0f',
        panel: '#1a1a1a',
        border: '#2a2a2a',
        accent: '#7c3aed',
        'accent-hover': '#6d28d9',
      },
    },
  },
  plugins: [],
}
