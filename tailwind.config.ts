import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'camp-green': '#2d5016',
        'camp-light': '#6ba84d',
        'camp-accent': '#f4a460',
      },
    },
  },
  plugins: [],
}
export default config
