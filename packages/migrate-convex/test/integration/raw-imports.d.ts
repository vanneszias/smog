/** Vite's `?raw` imports: a fixture file's text (the integration suite reads the fixture export this way, since workerd has no file system). */
declare module "*?raw" {
  const text: string;
  export default text;
}
