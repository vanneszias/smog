// A font file import is its URL: Vite (the site) and Remotion's webpack
// (`@remotion/bundler`) both emit the file and answer its URL; Bun answers
// its path (phase 7 ruling 6).
declare module "*.woff2" {
  const url: string;
  export default url;
}
