import { fmtKr } from "./utils";

export default function FinanceWidget({ event }) {
  const hasPrices = (event.price_member ?? 0) > 0 || (event.price_non_member ?? 0) > 0;
  if (!hasPrices) return null;

  return (
    <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="finance-widget">
      <Card label="Forventet" value={fmtKr(event.expected_revenue)} testId="finance-expected" />
      <Card label="Betalt" value={fmtKr(event.paid_revenue)} testId="finance-paid" highlight />
      <Card
        label="Mangler"
        value={fmtKr(event.outstanding_revenue)}
        testId="finance-outstanding"
        style={{ color: (event.outstanding_revenue ?? 0) > 0 ? "#B88E35" : "#417A57" }}
      />
    </div>
  );
}

function Card({ label, value, testId, highlight, style }) {
  return (
    <div className={`border border-border rounded-md p-4 ${highlight ? "bg-primary/5" : "bg-white"}`}>
      <div className="label-tiny">{label}</div>
      <div
        className={`mt-1 text-xl font-bold ${highlight ? "text-primary" : "text-foreground"}`}
        data-testid={testId}
        style={style}
      >
        {value}
      </div>
    </div>
  );
}
