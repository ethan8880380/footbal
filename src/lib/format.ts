export function formatValue(value: number | null | undefined) {
  return value == null ? "—" : Math.round(value).toLocaleString("en-US");
}

export function formatNumber(value: number | string | null | undefined, digits = 1) {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toFixed(digits);
}

export function formatAge(age: number | null | undefined) {
  return age == null ? "—" : age.toFixed(1);
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function relativeTime(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "never";
  const diff = now - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function signed(value: number | null | undefined, digits = 0) {
  if (value == null) return "—";
  const rounded = digits ? value.toFixed(digits) : Math.round(value).toLocaleString("en-US");
  return value > 0 ? `+${rounded}` : rounded;
}
