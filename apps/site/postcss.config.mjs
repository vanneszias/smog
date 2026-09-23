/**
 * Tailwind v4 runs as a PostCSS plugin here rather than through
 * `@tailwindcss/vite`, because Next owns the CSS pipeline and PostCSS is the
 * only hook it offers.
 *
 * The plugin is a no-op for a stylesheet with no Tailwind at-rules in it, so
 * the template's `(frontend)/styles.css` and the Payload admin's `custom.css`
 * pass through untouched.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
