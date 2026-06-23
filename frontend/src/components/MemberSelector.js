import { useEffect, useRef, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, User } from "lucide-react";
import { toast } from "sonner";

/**
 * Member picker with wildcard search.
 * - value: object { id, navn, email, telefon } or null
 * - onChange(member | null)
 */
export default function MemberSelector({ value, onChange, "data-testid": testId }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (!open || !q.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get("/members", { params: { q, limit: 10 } });
        setResults(data.items);
      } catch (err) {
        toast.error(formatApiError(err));
      } finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  if (value && value.id) {
    return (
      <div
        className="border border-border rounded-md p-3 bg-muted/30 flex items-start justify-between gap-3"
        data-testid={testId}
      >
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <User className="w-4 h-4" strokeWidth={1.6} />
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate">{value.navn || "—"}</div>
            <div className="text-xs text-muted-foreground truncate">
              {value.email && <span>{value.email}</span>}
              {value.email && value.telefon && <span> · </span>}
              {value.telefon && <span>{value.telefon}</span>}
            </div>
          </div>
        </div>
        <Button
          type="button" size="icon" variant="ghost"
          onClick={() => onChange(null)}
          data-testid={`${testId}-clear`}
          title="Fjern"
        >
          <X className="w-4 h-4" strokeWidth={1.6} />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative" ref={wrapRef}>
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Søg medlem (navn, medlemsnr., telefon, email)..."
          className="pl-9"
          data-testid={testId}
          autoComplete="off"
        />
      </div>
      {open && q.trim() && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-border rounded-md shadow-lg max-h-72 overflow-y-auto" data-testid={`${testId}-results`}>
          {loading && <div className="p-3 text-sm text-muted-foreground text-center">Søger...</div>}
          {!loading && results.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground text-center">Ingen medlemmer matcher.</div>
          )}
          {results.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => { onChange(m); setOpen(false); setQ(""); setResults([]); }}
              className="w-full text-left px-3 py-2 hover:bg-muted/60 border-b border-border last:border-b-0"
              data-testid={`${testId}-option-${m.id}`}
            >
              <div className="font-medium text-sm">{m.navn}</div>
              <div className="text-xs text-muted-foreground truncate">
                #{m.medlemsnummer}
                {m.email && ` · ${m.email}`}
                {m.telefon && ` · ${m.telefon}`}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
