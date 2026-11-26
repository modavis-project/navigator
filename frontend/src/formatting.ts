export function friendlyLabel(value?: string | null) {
  return String(value || "")
    .replace(/_/g, " ")
    .split(" ")
    .map((word) => word ? `${word[0].toLocaleUpperCase()}${word.slice(1)}` : word)
    .join(" ");
}

export function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(value);
}

export function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Unknown";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(formatFieldValue).join(", ");
  return JSON.stringify(value);
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
