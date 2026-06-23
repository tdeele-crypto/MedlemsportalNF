import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Search, Check, Undo2 } from "lucide-react";
import { toast } from "sonner";

export default function QuickCheckInPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [event, setEvent] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState({});
  const inputRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [e, p] = await Promise.all([
        api.get(`/events/${id}`),
        api.get(`/events/${id}/participants`),
      ]);
      setEvent(e.data);
      setParticipants(p.data);
    } catch (err) { toast.error(formatApiError(err)); }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return participants;
    return participants.filter((p) =>
      [p.navn, p.medlemsnummer, p.email, p.telefon, p.adresse]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    );
  }, [participants, q]);

  if (!isAdmin) return <Navigate to={`/arrangementer/${id}`} replace />;

  const toggle = async (p) => {
    setBusy((b) => ({ ...b, [p.id]: true }));
    try {
      await api.patch(`/events/${id}/participants/${p.id}`, { checked_in: !p.checked_in });
      // Optimistic merge
      setParticipants((prev) => prev.map((x) => x.id === p.id ? { ...x, checked_in: !x.checked_in } : x));
      if (!p.checked_in) {
        toast.success(`${p.navn} tjekket ind`);
      }
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy((b) => ({ ...b, [p.id]: false }));
      // Re-fetch event to update header totals
      try {
        const { data } = await api.get(`/events/${id}`);
        setEvent(data);
      } catch { /* ignore */ }
    }
  };

  if (!event) {
    return <div className="p-10 text-sm text-muted-foreground">Indlæser...</div>;
  }

  const totalAttendees = event.total_attendees ?? 0;
  const checkedIn = event.checked_in_attendees ?? 0;
  const pct = totalAttendees > 0 ? Math.round((checkedIn / totalAttendees) * 100) : 0;

  return (
    <div className="min-h-screen flex flex-col bg-background" data-testid="checkin-page">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-white border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          <Link to={`/arrangementer/${id}`} data-testid="checkin-back">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" strokeWidth={1.6} />
              <span className="hidden sm:inline">Tilbage</span>
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate text-foreground">{event.title}</div>
            <div className="text-xs text-muted-foreground">Hurtig check-in</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary leading-none" data-testid="checkin-counter">
              {checkedIn}<span className="text-muted-foreground/60 text-base font-normal"> / {totalAttendees}</span>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">mødt op ({pct}%)</div>
          </div>
        </div>
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Søg på navn, medl. nr., telefon eller email..."
              className="pl-10 h-12 text-base bg-white"
              data-testid="checkin-search-input"
              autoComplete="off"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-4">
        <ul className="space-y-2" data-testid="checkin-list">
          {filtered.length === 0 && (
            <li className="text-center text-sm text-muted-foreground py-10">
              {participants.length === 0 ? "Ingen tilmeldte." : "Ingen deltagere matcher."}
            </li>
          )}
          {filtered.map((p) => {
            const total = (p.num_members || 0) + (p.num_non_members || 0);
            const isBusy = !!busy[p.id];
            return (
              <li
                key={p.id}
                data-testid={`checkin-row-${p.id}`}
                className={`border rounded-md p-3 sm:p-4 flex items-center gap-3 transition-colors ${
                  p.checked_in
                    ? "bg-primary/5 border-primary/30"
                    : "bg-white border-border"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-base sm:text-lg truncate text-foreground">
                    {p.navn}
                  </div>
                  <div className="text-xs sm:text-sm text-muted-foreground truncate">
                    #{p.medlemsnummer}
                    {p.telefon && ` · ${p.telefon}`}
                    {total > 1 && ` · ${total} deltagere (${p.num_members || 0}+${p.num_non_members || 0})`}
                  </div>
                </div>
                <Button
                  size="lg"
                  variant={p.checked_in ? "outline" : "default"}
                  disabled={isBusy}
                  onClick={() => toggle(p)}
                  className={p.checked_in
                    ? "min-w-[110px] sm:min-w-[140px]"
                    : "min-w-[110px] sm:min-w-[140px] bg-primary hover:bg-primary/90 text-primary-foreground"
                  }
                  data-testid={`checkin-toggle-${p.id}`}
                >
                  {p.checked_in ? (
                    <>
                      <Undo2 className="w-4 h-4 mr-2" strokeWidth={1.8} />
                      Fortryd
                    </>
                  ) : (
                    <>
                      <Check className="w-5 h-5 mr-2" strokeWidth={2} />
                      Tjek ind
                    </>
                  )}
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
