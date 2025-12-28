/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        tracer: {
          start: '#FFD700',
          end: '#FF4500'
        }
      }
    },
  },
  plugins: [],
}
