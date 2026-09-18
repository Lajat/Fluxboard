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
