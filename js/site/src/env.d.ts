// Vite's ?raw imports give a file's text (used for README.md at build time).
declare module "*?raw" {
  const text: string;
  export default text;
}
