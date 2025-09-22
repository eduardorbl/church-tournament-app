/**
 * TailwindCSS configuration for the tournament application.
 *
 * We extend the default palette with two custom colours (primary and secondary)
 * that roughly follow the colour scheme suggested by the user.  Feel free
 * to adjust these values in the future to match the final branding of the
 * event.
 */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0A5FBD',
        secondary: '#FFD200',
      },
    },
  },
  plugins: [],
};