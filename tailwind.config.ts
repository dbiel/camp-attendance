import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'camp-green': '#cc0000',   // primary -> TTU red
        'camp-light': '#e03b3b',   // lighter red (hover/secondary)
        'camp-accent': '#d4880a',  // warm amber accent
      },
    },
  },
  plugins: [],
}
export default config
