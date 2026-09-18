/**
 * Derives a short, uppercase prefix from a board's title, used to build
 * human-readable card task IDs like "BT-1", "BT-2" (Jira-style project
 * keys). Multi-word titles use each word's first letter ("Bug Tracking" ->
 * "BT"); single-word titles use its first few letters ("Marketing" ->
 * "MAR"). Falls back to "TASK" if the title has no usable letters at all
 * (e.g. a title that's just emoji or numbers) so every board always ends
 * up with a valid, non-empty prefix.
 */
export function generateKeyPrefix(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);

  let prefix: string;
  if (words.length >= 2) {
    prefix = words
      .slice(0, 4)
      .map((w) => w[0])
      .join("");
  } else if (words.length === 1) {
    prefix = words[0].slice(0, 3);
  } else {
    prefix = "";
  }

  prefix = prefix.toUpperCase().replace(/[^A-Z]/g, "");

  if (prefix.length < 2) return "TASK";
  return prefix.slice(0, 5);
}
