/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,js}'],
  theme: {
    extend: {
      fontFamily: {
        fraktur: ['UnifrakturCook', 'serif'],
        cinzel: ['Cinzel', 'serif'],
      },
      colors: {
        mund: {
          void: '#05060a',
          ash: '#0b0d14',
          fog: '#9aa3b2',
          bone: '#e8e4d8',
          blood: '#7a1f2b',
        },
      },
      keyframes: {
        flicker: {
          '0%, 100%': { opacity: '1' },
          '45%': { opacity: '0.86' },
          '50%': { opacity: '0.6' },
          '55%': { opacity: '0.92' },
        },
      },
      animation: {
        flicker: 'flicker 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
