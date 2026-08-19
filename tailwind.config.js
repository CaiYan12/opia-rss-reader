/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--t-bg)',
        surface: 'var(--t-surface)',
        card: 'var(--t-card)',
        border: 'var(--t-border)',
        text: 'var(--t-text)',
        'text-secondary': 'var(--t-text-secondary)',
        accent: 'var(--t-accent)',
        'accent-hover': 'var(--t-accent-hover)',
        'on-accent': 'var(--t-on-accent)',
        chip: 'var(--t-chip)',
        'chip-text': 'var(--t-chip-text)',
        read: 'var(--t-read)'
      },
      fontFamily: {
        heading: 'var(--t-font-heading)',
        body: 'var(--t-font-body)'
      },
      fontSize: {
        base: 'var(--t-font-size-base)'
      },
      borderRadius: {
        card: 'var(--t-radius)'
      }
    }
  },
  plugins: []
}
