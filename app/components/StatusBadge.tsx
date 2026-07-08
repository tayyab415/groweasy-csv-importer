const STATUS_STYLES: Record<string, string> = {
  GOOD_LEAD_FOLLOW_UP: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  SALE_DONE: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  DID_NOT_CONNECT: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  BAD_LEAD: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

/** Colored pill for a crm_status value (falls back to a neutral dash). */
export default function StatusBadge({ value }: { value: string }) {
  if (!value) return <span className="text-[var(--text-muted)]">—</span>;
  const cls = STATUS_STYLES[value] ?? "bg-[var(--surface-2)] text-[var(--text-muted)]";
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {value.replace(/_/g, " ")}
    </span>
  );
}
