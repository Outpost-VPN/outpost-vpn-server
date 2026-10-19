export function escapeHtml(value: unknown) {
  if (typeof value !== "string") throw new TypeError(`HTML value must be a string, received ${String(value)}`);
  return value.replace(/[&<>"']/g, (character) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[character]!);
}
