/**
 * Color-coded badge for membership type.
 *
 * Livsvarigt medlemskab        → guld (særligt, livstid)
 * Alm. medlemskab              → grøn (standard, betalende)
 * Medlemskab uden opkrævning   → grå  (ikke-betalende)
 */
const STYLES = {
  "Livsvarigt medlemskab": {
    border: "border-amber-500/40",
    text: "text-amber-700",
    bg: "bg-amber-50",
    short: "Livsvarigt",
  },
  "Alm. medlemskab": {
    border: "border-primary/40",
    text: "text-primary",
    bg: "bg-primary/5",
    short: "Alm.",
  },
  "Medlemskab uden opkrævning": {
    border: "border-slate-400/40",
    text: "text-slate-600",
    bg: "bg-slate-50",
    short: "Uden opkrævning",
  },
};

export default function MedlemstypeBadge({ type, compact = false, testId }) {
  if (!type) return null;
  const style = STYLES[type] || {
    border: "border-border",
    text: "text-muted-foreground",
    bg: "bg-muted/30",
    short: type,
  };
  const label = compact ? style.short : type;
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center whitespace-nowrap text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-normal ${style.border} ${style.text} ${style.bg}`}
    >
      {label}
    </span>
  );
}
