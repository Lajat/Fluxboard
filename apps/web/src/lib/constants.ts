/**
 * App-wide constants that have no better home. Currently just the display
 * name — it was previously hardcoded as a literal string in eight
 * different files, with inconsistent capitalization ("fluxboard" in most
 * places, "Fluxboard" on the signup page) since nothing enforced they all
 * agree. Importing this one constant everywhere means a future rebrand,
 * or just fixing the capitalization, is a one-line change instead of a
 * grep-and-replace across the codebase.
 */
export const APP_NAME = "Fluxboard";

/**
 * Kept in sync with package.json's "version" by hand — a client component
 * can't read package.json directly at runtime without extra build wiring
 * (e.g. a next.config.js rewrite into NEXT_PUBLIC_*), which felt like a
 * lot of machinery for a value that changes rarely. Shown in the profile
 * menu footer, the way most real apps surface their version somewhere in
 * an account/settings menu rather than on the page itself.
 */
export const APP_VERSION = "1.0.0";
