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
import MedlemstypeBadge from "@/components/MedlemstypeBadge";
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
  const [numFree, setNumFree] = useState(0);
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
      setNumFree(0); setQ(""); setResults([]);
    }
  }, [open]);

  const nm = Number(numMembers) || 0;
  const nnm = Number(numNonMembers) || 0;
  const nf = Number(numFree) || 0;
  const total = nm + nnm + nf;
  const freeTooMany = nf > nm + nnm;

  const handleAdd = async () => {
    if (!selected) return;
    if (nm + nnm < 1) { toast.error("Antal skal være mindst 1"); return; }
    if (freeTooMany) {
      toast.error("Du har angivet flere gratis deltagere end der er tilmeldte");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/events/${eventId}/participants`, {
        member_id: selected.id, note,
        num_members: nm, num_non_members: nnm, num_free: nf,
      });
      toast.success(`${selected.navn} tilmeldt (${total} deltagere)`);
      onOpenChange(false);
      await onAdded?.();
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white max-w-[calc(100vw-1rem)] sm:max-w-2xl" data-testid="add-participant-dialog">
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
                        <MedlemstypeBadge
                          type={m.medlemstype}
                          compact
                          testId={`search-result-medlemstype-${m.id}`}
                        />
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
                <MedlemstypeBadge type={selected.medlemstype} testId="selected-medlemstype" />
              </div>
              <div className="text-xs text-muted-foreground whitespace-pre-line mt-1">{selected.adresse}</div>
              <div className="text-xs text-muted-foreground mt-1">
                #{selected.medlemsnummer} · {selected.email} · {selected.telefon}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                <Label htmlFor="num-free">Gratis deltagere</Label>
                <Input
                  id="num-free" type="number" min="0"
                  value={numFree}
                  onChange={(e) => setNumFree(e.target.value)}
                  data-testid="num-free-input"
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
            <p className="text-xs text-muted-foreground" data-testid="add-participant-total">
              I alt: <strong>{total}</strong> deltager{total === 1 ? "" : "e"} på denne tilmelding
              {nf > 0 && !freeTooMany && <span> · <strong>{nf}</strong> gratis</span>}
            </p>
            {freeTooMany && (
              <p className="text-xs text-destructive" data-testid="add-participant-free-error">
                Du har angivet {nf} gratis, men kun {nm + nnm} tilmeldte. Reducér gratis eller tilføj flere personer.
              </p>
            )}
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
                type="button" onClick={handleAdd} disabled={saving || freeTooMany}
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
