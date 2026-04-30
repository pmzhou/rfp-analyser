/**
 * Date formatter — defaults to dd/mm/yyyy.
 * Accepts ISO strings, native Date objects, or YYYY-MM-DD strings.
 * Returns "—" for empty/invalid input.
 */
export function formatDate(input, fmt = "dd/mm/yyyy") {
  if (!input) return "—";
  let d;
  if (input instanceof Date) d = input;
  else if (typeof input === "string") {
    // Already in dd/mm/yyyy → return as-is
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(input)) return input;
    d = new Date(input);
  } else return "—";
  if (isNaN(d.getTime())) return String(input);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  if (fmt === "mm/dd/yyyy") return `${mm}/${dd}/${yyyy}`;
  if (fmt === "yyyy-mm-dd") return `${yyyy}-${mm}-${dd}`;
  return `${dd}/${mm}/${yyyy}`;
}

/** Format date + time → dd/mm/yyyy HH:MM */
export function formatDateTime(input) {
  if (!input) return "—";
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return String(input);
  const date = formatDate(d);
  const hh = String(d.getHours()).padStart(2, "0");
  const mn = String(d.getMinutes()).padStart(2, "0");
  return `${date} ${hh}:${mn}`;
}
