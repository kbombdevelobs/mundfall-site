/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,js}'],
  theme: {
    extend: {
      colors: {
        void: '#06060a',
        abyss: '#0b0b12',
        bone: '#e6e1d3',
        ash: '#8d8878',
        blood: '#a4161a',
        ember: '#e5383b',
      },
      fontFamily: {
        fraktur: ['"UnifrakturMaguntia"', 'serif'],
        rite: ['"Cinzel"', 'serif'],
      },
      letterSpacing: {
        rite: '0.42em',
      },
    },
  },
  plugins: [],
};
