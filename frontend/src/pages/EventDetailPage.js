import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Calendar, MapPin, Plus, Search, Trash2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";

export default function EventDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [event, setEvent] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [q, setQ] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [note, setNote] = useState("");
  const [numMembers, setNumMembers] = useState(1);
  const [numNonMembers, setNumNonMembers] = useState(0);
  const [saving, setSaving] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteVal, setEditingNoteVal] = useState("");

  const loadEvent = useCallback(async () => {
    try {
      const [e, p] = await Promise.all([
        api.get(`/events/${id}`),
        api.get(`/events/${id}/participants`),
      ]);
      setEvent(e.data);
      setParticipants(p.data);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  }, [id]);

  useEffect(() => {
    loadEvent();
  }, [loadEvent]);

  // Live search
  useEffect(() => {
    if (!addOpen) return;
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.get("/members", { params: { q, limit: 20 } });
        setSearchResults(data.items);
      } catch (err) {
        toast.error(formatApiError(err));
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, addOpen]);

  const enrolledMemberIds = useMemo(
    () => new Set(participants.map((p) => p.member_id)),
    [participants]
  );

  const handleAdd = async () => {
    if (!selectedMember) return;
    const nm = Number(numMembers) || 0;
    const nnm = Number(numNonMembers) || 0;
    if (nm + nnm < 1) {
      toast.error("Antal skal være mindst 1");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/events/${id}/participants`, {
        member_id: selectedMember.id,
        note,
        num_members: nm,
        num_non_members: nnm,
      });
      toast.success(`${selectedMember.navn} tilmeldt (${nm + nnm} deltagere)`);
      setSelectedMember(null);
      setNote("");
      setNumMembers(1);
      setNumNonMembers(0);
      setQ("");
      setSearchResults([]);
      setAddOpen(false);
      await loadEvent();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (pid) => {
    try {
      await api.delete(`/events/${id}/participants/${pid}`);
      toast.success("Tilmelding fjernet");
      await loadEvent();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const handleSaveNote = async (pid) => {
    try {
      await api.patch(`/events/${id}/participants/${pid}`, {
        note: editingNoteVal,
      });
      setEditingNoteId(null);
      await loadEvent();
      toast.success("Note opdateret");
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const handleTogglePaid = async (p) => {
    try {
      await api.patch(`/events/${id}/participants/${p.id}`, { paid: !p.paid });
      await loadEvent();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  if (!event) {
    return (
      <div className="p-10 text-sm text-muted-foreground" data-testid="event-detail-loading">
        Indlæser arrangement...
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto" data-testid="event-detail-page">
      <Link
        to="/arrangementer"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        data-testid="back-to-events"
      >
        <ArrowLeft className="w-4 h-4 mr-1" strokeWidth={1.6} />
        Tilbage til arrangementer
      </Link>

      <div className="mt-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight" data-testid="event-title">
            {event.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {event.event_date && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" strokeWidth={1.5} />
                {new Date(event.event_date).toLocaleDateString("da-DK", {
                  weekday: "long", day: "numeric", month: "long", year: "numeric",
                })}
              </span>
            )}
            {event.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4" strokeWidth={1.5} />
                {event.location}
              </span>
            )}
          </div>
          {event.description && (
            <p className="mt-3 text-sm text-foreground/80 max-w-2xl leading-relaxed">
              {event.description}
            </p>
          )}
          {(event.price_member > 0 || event.price_non_member > 0) && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              <span className="px-2 py-1 rounded-md bg-primary/10 text-primary" data-testid="event-price-member">
                Medlem: {event.price_member} kr.
              </span>
              <span className="px-2 py-1 rounded-md bg-muted text-foreground/70" data-testid="event-price-non-member">
                Ikke-medlem: {event.price_non_member} kr.
              </span>
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-4xl font-bold text-primary" data-testid="participant-count">
            {event.total_attendees ?? participants.length}
          </div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">deltagere i alt</div>
          <div className="mt-2 text-xs text-muted-foreground">
            <span data-testid="total-members">{event.total_members ?? 0}</span> medlem{(event.total_members ?? 0) === 1 ? "" : "mer"}
            {" · "}
            <span data-testid="total-non-members">{event.total_non_members ?? 0}</span> ikke-medl.
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {participants.length} tilmelding{participants.length === 1 ? "" : "er"}
          </div>
        </div>
      </div>

      <div className="mt-10 flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Deltagere</h2>
        {isAdmin && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                data-testid="add-participant-button"
              >
                <Plus className="w-4 h-4 mr-2" strokeWidth={1.6} />
                Tilføj deltager
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white max-w-2xl" data-testid="add-participant-dialog">
              <DialogHeader>
                <DialogTitle>Tilføj deltager</DialogTitle>
              </DialogHeader>

              {!selectedMember ? (
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
                    {searching && (
                      <div className="p-4 text-sm text-muted-foreground text-center">Søger...</div>
                    )}
                    {!searching && q && searchResults.length === 0 && (
                      <div className="p-4 text-sm text-muted-foreground text-center">
                        Ingen medlemmer matchede.
                      </div>
                    )}
                    {!q && !searching && (
                      <div className="p-4 text-sm text-muted-foreground text-center">
                        Start med at skrive for at søge.
                      </div>
                    )}
                    {searchResults.map((m) => {
                      const already = enrolledMemberIds.has(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          disabled={already}
                          onClick={() => setSelectedMember(m)}
                          data-testid={`search-result-${m.id}`}
                          className="w-full text-left p-3 hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-sm">{m.navn}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              #{m.medlemsnummer} · {m.email} · {m.telefon}
                            </div>
                          </div>
                          {already && (
                            <span className="text-xs text-primary font-medium whitespace-nowrap">
                              Allerede tilmeldt
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="border border-border rounded-md p-4 bg-muted/30">
                    <div className="font-medium">{selectedMember.navn}</div>
                    <div className="text-xs text-muted-foreground whitespace-pre-line mt-1">
                      {selectedMember.adresse}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      #{selectedMember.medlemsnummer} · {selectedMember.email} · {selectedMember.telefon}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="num-members">Antal medlemmer</Label>
                      <Input
                        id="num-members"
                        type="number"
                        min="0"
                        value={numMembers}
                        onChange={(e) => setNumMembers(e.target.value)}
                        data-testid="num-members-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="num-non-members">Antal ikke-medlemmer</Label>
                      <Input
                        id="num-non-members"
                        type="number"
                        min="0"
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
                {selectedMember ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => { setSelectedMember(null); setNote(""); setNumMembers(1); setNumNonMembers(0); }}
                      data-testid="participant-back"
                    >
                      Tilbage
                    </Button>
                    <Button
                      type="button"
                      onClick={handleAdd}
                      disabled={saving}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground"
                      data-testid="participant-confirm-add"
                    >
                      {saving ? "Tilføjer..." : "Tilføj"}
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setAddOpen(false)}
                    data-testid="participant-close"
                  >
                    Luk
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="mt-4 border border-border rounded-md bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-20">Medl. nr.</TableHead>
              <TableHead>Navn & adresse</TableHead>
              <TableHead className="hidden md:table-cell">Kontakt</TableHead>
              <TableHead className="w-28">Antal</TableHead>
              <TableHead className="w-20 text-center">Betalt</TableHead>
              <TableHead>Note</TableHead>
              {isAdmin && <TableHead className="w-16"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {participants.length === 0 && (
              <TableRow>
                <TableCell colSpan={isAdmin ? 7 : 6} className="text-center text-sm text-muted-foreground py-10">
                  Ingen deltagere endnu.
                </TableCell>
              </TableRow>
            )}
            {participants.map((p) => {
              const total = (p.num_members || 0) + (p.num_non_members || 0);
              return (
              <TableRow key={p.id} data-testid={`participant-row-${p.id}`} className={p.paid ? "bg-primary/5" : ""}>
                <TableCell className="font-mono text-xs align-top">{p.medlemsnummer}</TableCell>
                <TableCell className="align-top">
                  <div className="font-medium">{p.navn}</div>
                  {p.adresse && (
                    <div className="text-xs text-muted-foreground whitespace-pre-line mt-0.5">
                      {p.adresse.split("\n").slice(1).join(", ")}
                    </div>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm align-top">
                  <div>{p.email}</div>
                  <div className="text-xs text-muted-foreground">{p.telefon}</div>
                </TableCell>
                <TableCell className="align-top text-sm" data-testid={`participant-count-${p.id}`}>
                  <div className="font-semibold">{total}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.num_members || 0} medl. · {p.num_non_members || 0} ikke-m.
                  </div>
                </TableCell>
                <TableCell className="align-top text-center">
                  <Checkbox
                    checked={!!p.paid}
                    onCheckedChange={() => isAdmin && handleTogglePaid(p)}
                    disabled={!isAdmin}
                    data-testid={`paid-checkbox-${p.id}`}
                    aria-label="Betalt"
                  />
                </TableCell>
                <TableCell className="align-top text-sm">
                  {editingNoteId === p.id ? (
                    <div className="flex items-start gap-2">
                      <Textarea
                        value={editingNoteVal}
                        onChange={(e) => setEditingNoteVal(e.target.value)}
                        rows={2}
                        className="text-sm"
                        data-testid={`edit-note-input-${p.id}`}
                      />
                      <div className="flex flex-col gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleSaveNote(p.id)}
                          data-testid={`save-note-${p.id}`}
                        >
                          <Check className="w-4 h-4 text-primary" strokeWidth={1.6} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditingNoteId(null)}
                          data-testid={`cancel-note-${p.id}`}
                        >
                          <X className="w-4 h-4" strokeWidth={1.6} />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 group">
                      <span className="flex-1 text-muted-foreground whitespace-pre-line">
                        {p.note || <span className="italic text-muted-foreground/60">Ingen note</span>}
                      </span>
                      {isAdmin && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => { setEditingNoteId(p.id); setEditingNoteVal(p.note || ""); }}
                          data-testid={`edit-note-${p.id}`}
                        >
                          <Pencil className="w-3.5 h-3.5" strokeWidth={1.6} />
                        </Button>
                      )}
                    </div>
                  )}
                </TableCell>
                {isAdmin && (
                  <TableCell className="align-top">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          data-testid={`remove-participant-${p.id}`}
                        >
                          <Trash2 className="w-4 h-4" strokeWidth={1.6} />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-white">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Fjern {p.navn}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tilmeldingen fjernes fra arrangementet. Medlemmet bliver i medlemslisten.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel data-testid={`remove-cancel-${p.id}`}>Annullér</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleRemove(p.id)}
                            className="bg-destructive hover:bg-destructive/90"
                            data-testid={`remove-confirm-${p.id}`}
                          >
                            Fjern
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                )}
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
