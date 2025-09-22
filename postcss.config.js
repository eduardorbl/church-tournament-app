/**
 * PostCSS configuration.  TailwindCSS and autoprefixer are enabled to
 * generate the final CSS bundle from the utility classes.  No custom
 * processing is necessary here.
 */
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};