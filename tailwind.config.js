/** @type {import('tailwindcss').Config} */
// Lullaby design tokens mirror src/theme/index.ts — keep the two in sync.
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        cream: '#FBF4EF',
        surface: '#FFFFFF',
        'surface-soft': '#FBF6F2',
        ink: '#2E2A40',
        'ink-soft': '#736E86',
        'ink-faint': '#A8A2B8',
        line: '#F0E8E2',
        feed: { DEFAULT: '#FF7A3D', tint: '#FFEDE0' },
        sleep: { DEFAULT: '#5560C6', tint: '#E9EBFB' },
        diaper: { DEFAULT: '#23B79E', tint: '#DDF5EF' },
        alert: { DEFAULT: '#E0574B', tint: '#FBE7E4' },
      },
      borderRadius: {
        lg: '34px',
        md: '24px',
        sm: '16px',
        pill: '999px',
      },
      fontFamily: {
        display: ['Fredoka_600SemiBold'],
        'display-medium': ['Fredoka_500Medium'],
        body: ['Nunito_600SemiBold'],
        'body-bold': ['Nunito_800ExtraBold'],
      },
    },
  },
  plugins: [],
};
