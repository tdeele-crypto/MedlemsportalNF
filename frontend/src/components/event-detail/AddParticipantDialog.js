import { useEffect, useMemo, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Search } from "lucide-react";
import { toast } from "sonner";

export default function AddParticipantDialog({
  open, onOpenChange, eventId, enrolledMemberIds, onAdded,
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState("");
  const [numMembers, setNumMembers] = useState(1);
  const [numNonMembers, setNumNonMembers] = useState(0);
  const [saving, setSaving] = useState(false);

  const enrolledSet = useMemo(
    () => new Set(enrolledMemberIds || []),
    [enrolledMemberIds]
  );

  useEffect(() => {
    if (!open) return;
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.get("/members", { params: { q, limit: 20 } });
        setResults(data.items);
      } catch (err) { toast.error(formatApiError(err)); }
      finally { setSearching(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  useEffect(() => {
    if (!open) {
      setSelected(null); setNote(""); setNumMembers(1); setNumNonMembers(0);
      setQ(""); setResults([]);
    }
  }, [open]);

  const handleAdd = async () => {
    if (!selected) return;
    const nm = Number(numMembers) || 0;
    const nnm = Number(numNonMembers) || 0;
    if (nm + nnm < 1) { toast.error("Antal skal være mindst 1"); return; }
    setSaving(true);
    try {
      await api.post(`/events/${eventId}/participants`, {
        member_id: selected.id, note, num_members: nm, num_non_members: nnm,
      });
      toast.success(`${selected.navn} tilmeldt (${nm + nnm} deltagere)`);
      onOpenChange(false);
      await onAdded?.();
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="add-participant-dialog">
        <DialogHeader>
          <DialogTitle>Tilføj deltager</DialogTitle>
        </DialogHeader>
        {!selected ? (
          <>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Søg på medlemsnr., navn, adresse, telefon eller email..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9"
                data-testid="participant-search-input"
              />
            </div>
            <div className="max-h-72 overflow-y-auto border border-border rounded-md divide-y divide-border">
              {searching && <div className="p-4 text-sm text-muted-foreground text-center">Søger...</div>}
              {!searching && q && results.length === 0 && (
                <div className="p-4 text-sm text-muted-foreground text-center">Ingen medlemmer matchede.</div>
              )}
              {!q && !searching && (
                <div className="p-4 text-sm text-muted-foreground text-center">Start med at skrive for at søge.</div>
              )}
              {results.map((m) => {
                const already = enrolledSet.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={already}
                    onClick={() => setSelected(m)}
                    data-testid={`search-result-${m.id}`}
                    className="w-full text-left p-3 hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                        <span>{m.navn}</span>
                        {m.medlemstype && (
                          <span
                            className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-primary/30 text-primary font-normal"
                            data-testid={`search-result-medlemstype-${m.id}`}
                          >
                            {m.medlemstype}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        #{m.medlemsnummer} · {m.email} · {m.telefon}
                      </div>
                    </div>
                    {already && <span className="text-xs text-primary font-medium whitespace-nowrap">Allerede tilmeldt</span>}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="border border-border rounded-md p-4 bg-muted/30">
              <div className="font-medium flex items-center gap-2 flex-wrap">
                <span>{selected.navn}</span>
                {selected.medlemstype && (
                  <span
                    className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-primary/30 text-primary font-normal"
                    data-testid="selected-medlemstype"
                  >
                    {selected.medlemstype}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground whitespace-pre-line mt-1">{selected.adresse}</div>
              <div className="text-xs text-muted-foreground mt-1">
                #{selected.medlemsnummer} · {selected.email} · {selected.telefon}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="num-members">Antal medlemmer</Label>
                <Input
                  id="num-members" type="number" min="0"
                  value={numMembers}
                  onChange={(e) => setNumMembers(e.target.value)}
                  data-testid="num-members-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="num-non-members">Antal ikke-medlemmer</Label>
                <Input
                  id="num-non-members" type="number" min="0"
                  value={numNonMembers}
                  onChange={(e) => setNumNonMembers(e.target.value)}
                  data-testid="num-non-members-input"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              I alt: <strong>{(Number(numMembers) || 0) + (Number(numNonMembers) || 0)}</strong> deltagere på denne tilmelding
            </p>
            <div className="space-y-2">
              <Label htmlFor="note">Note (valgfri)</Label>
              <Textarea
                id="note"
                placeholder="F.eks. vegetar, kommer kl. 19, allergier..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                data-testid="participant-note-input"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          {selected ? (
            <>
              <Button type="button" variant="ghost" onClick={() => setSelected(null)} data-testid="participant-back">
                Tilbage
              </Button>
              <Button
                type="button" onClick={handleAdd} disabled={saving}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                data-testid="participant-confirm-add"
              >{saving ? "Tilføjer..." : "Tilføj"}</Button>
            </>
          ) : (
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} data-testid="participant-close">
              Luk
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
