/**
 * Ambient module declaration for CSS side-effect imports (e.g. `import
 * "./globals.css"`). Next.js normally provides this via its own package
 * types once `next` is installed, but declaring it explicitly here means
 * this typechecks even if that resolution ever fails (e.g. a partial
 * install, or a strict standalone `tsc` run outside the Next build).
 */
declare module "*.css";
