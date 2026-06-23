import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Calendar, MapPin, Plus, Search, Trash2, Pencil, Download, Settings2 } from "lucide-react";
import { toast } from "sonner";

const fmtKr = (n) => `${Math.round((Number(n) || 0) * 100) / 100} kr.`;

export default function EventDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [event, setEvent] = useState(null);
  const [participants, setParticipants] = useState([]);

  // Add participant
  const [addOpen, setAddOpen] = useState(false);
  const [q, setQ] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [note, setNote] = useState("");
  const [numMembers, setNumMembers] = useState(1);
  const [numNonMembers, setNumNonMembers] = useState(0);
  const [saving, setSaving] = useState(false);

  // Edit participant
  const [editP, setEditP] = useState(null);
  const [editForm, setEditForm] = useState({ num_members: 1, num_non_members: 0, note: "" });

  // Edit event
  const [eventEditOpen, setEventEditOpen] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: "", description: "", location: "", event_date: "", event_time: "", price_member: "", price_non_member: "",
  });

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

  useEffect(() => { loadEvent(); }, [loadEvent]);

  useEffect(() => {
    if (!addOpen) return;
    if (!q.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.get("/members", { params: { q, limit: 20 } });
        setSearchResults(data.items);
      } catch (err) {
        toast.error(formatApiError(err));
      } finally { setSearching(false); }
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
    if (nm + nnm < 1) { toast.error("Antal skal være mindst 1"); return; }
    setSaving(true);
    try {
      await api.post(`/events/${id}/participants`, {
        member_id: selectedMember.id, note, num_members: nm, num_non_members: nnm,
      });
      toast.success(`${selectedMember.navn} tilmeldt (${nm + nnm} deltagere)`);
      setSelectedMember(null); setNote(""); setNumMembers(1); setNumNonMembers(0);
      setQ(""); setSearchResults([]); setAddOpen(false);
      await loadEvent();
    } catch (err) { toast.error(formatApiError(err)); } finally { setSaving(false); }
  };

  const handleRemove = async (pid) => {
    try {
      await api.delete(`/events/${id}/participants/${pid}`);
      toast.success("Tilmelding fjernet");
      await loadEvent();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  const handleTogglePaid = async (p) => {
    try {
      await api.patch(`/events/${id}/participants/${p.id}`, { paid: !p.paid });
      await loadEvent();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  const handleToggleCheckedIn = async (p) => {
    try {
      await api.patch(`/events/${id}/participants/${p.id}`, { checked_in: !p.checked_in });
      await loadEvent();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  const openEditParticipant = (p) => {
    setEditP(p);
    setEditForm({
      num_members: p.num_members ?? 1,
      num_non_members: p.num_non_members ?? 0,
      note: p.note ?? "",
    });
  };

  const handleSaveEditParticipant = async () => {
    if (!editP) return;
    const nm = Number(editForm.num_members) || 0;
    const nnm = Number(editForm.num_non_members) || 0;
    if (nm + nnm < 1) { toast.error("Antal skal være mindst 1"); return; }
    try {
      await api.patch(`/events/${id}/participants/${editP.id}`, {
        num_members: nm, num_non_members: nnm, note: editForm.note,
      });
      setEditP(null);
      await loadEvent();
      toast.success("Tilmelding opdateret");
    } catch (err) { toast.error(formatApiError(err)); }
  };

  const openEditEvent = () => {
    setEventForm({
      title: event.title || "",
      description: event.description || "",
      location: event.location || "",
      event_date: event.event_date || "",
      event_time: event.event_time || "",
      price_member: event.price_member ?? "",
      price_non_member: event.price_non_member ?? "",
    });
    setEventEditOpen(true);
  };

  const handleSaveEvent = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/events/${id}`, {
        ...eventForm,
        price_member: Number(eventForm.price_member) || 0,
        price_non_member: Number(eventForm.price_non_member) || 0,
      });
      setEventEditOpen(false);
      await loadEvent();
      toast.success("Arrangement opdateret");
    } catch (err) { toast.error(formatApiError(err)); }
  };

  const handleExportCsv = async () => {
    try {
      const { data } = await api.get(`/events/${id}/participants/export`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([data], { type: "text/csv;charset=utf-8;" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `deltagere_${(event?.title || "arrangement").replace(/\s+/g, "_")}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) { toast.error(formatApiError(err)); }
  };

  if (!event) {
    return <div className="p-10 text-sm text-muted-foreground" data-testid="event-detail-loading">Indlæser arrangement...</div>;
  }

  const hasPrices = (event.price_member ?? 0) > 0 || (event.price_non_member ?? 0) > 0;

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
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight" data-testid="event-title">
              {event.title}
            </h1>
            {isAdmin && (
              <Button
                size="icon"
                variant="ghost"
                onClick={openEditEvent}
                title="Rediger arrangement"
                data-testid="edit-event-button"
              >
                <Settings2 className="w-4 h-4" strokeWidth={1.6} />
              </Button>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {event.event_date && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" strokeWidth={1.5} />
                {new Date(event.event_date).toLocaleDateString("da-DK", {
                  weekday: "long", day: "numeric", month: "long", year: "numeric",
                })}
                {event.event_time && <span className="ml-1">kl. {event.event_time}</span>}
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
            <p className="mt-3 text-sm text-foreground/80 max-w-2xl leading-relaxed">{event.description}</p>
          )}
          {hasPrices && (
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
            {event.total_attendees ?? 0}
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
          {(event.total_attendees ?? 0) > 0 && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium" data-testid="checked-in-summary">
              <span data-testid="checked-in-count">{event.checked_in_attendees ?? 0}</span>
              <span>/</span>
              <span>{event.total_attendees}</span>
              <span className="text-muted-foreground font-normal">mødt op</span>
            </div>
          )}
        </div>
      </div>

      {/* Økonomi-widget */}
      {hasPrices && (
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="finance-widget">
          <div className="border border-border rounded-md p-4 bg-white">
            <div className="label-tiny">Forventet</div>
            <div className="mt-1 text-xl font-bold text-foreground" data-testid="finance-expected">
              {fmtKr(event.expected_revenue)}
            </div>
          </div>
          <div className="border border-border rounded-md p-4 bg-primary/5">
            <div className="label-tiny">Betalt</div>
            <div className="mt-1 text-xl font-bold text-primary" data-testid="finance-paid">
              {fmtKr(event.paid_revenue)}
            </div>
          </div>
          <div className="border border-border rounded-md p-4 bg-white">
            <div className="label-tiny">Mangler</div>
            <div
              className="mt-1 text-xl font-bold"
              style={{ color: (event.outstanding_revenue ?? 0) > 0 ? "#B88E35" : "#417A57" }}
              data-testid="finance-outstanding"
            >
              {fmtKr(event.outstanding_revenue)}
            </div>
          </div>
        </div>
      )}

      <div className="mt-10 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xl font-semibold tracking-tight">Deltagere</h2>
        <div className="flex items-center gap-2">
          {participants.length > 0 && (
            <Button
              variant="outline"
              onClick={handleExportCsv}
              data-testid="export-csv-button"
            >
              <Download className="w-4 h-4 mr-2" strokeWidth={1.6} />
              Eksportér CSV
            </Button>
          )}
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
                      {searching && <div className="p-4 text-sm text-muted-foreground text-center">Søger...</div>}
                      {!searching && q && searchResults.length === 0 && (
                        <div className="p-4 text-sm text-muted-foreground text-center">Ingen medlemmer matchede.</div>
                      )}
                      {!q && !searching && (
                        <div className="p-4 text-sm text-muted-foreground text-center">Start med at skrive for at søge.</div>
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
                            {already && <span className="text-xs text-primary font-medium whitespace-nowrap">Allerede tilmeldt</span>}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="border border-border rounded-md p-4 bg-muted/30">
                      <div className="font-medium">{selectedMember.navn}</div>
                      <div className="text-xs text-muted-foreground whitespace-pre-line mt-1">{selectedMember.adresse}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        #{selectedMember.medlemsnummer} · {selectedMember.email} · {selectedMember.telefon}
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
                  {selectedMember ? (
                    <>
                      <Button
                        type="button" variant="ghost"
                        onClick={() => { setSelectedMember(null); setNote(""); setNumMembers(1); setNumNonMembers(0); }}
                        data-testid="participant-back"
                      >Tilbage</Button>
                      <Button
                        type="button" onClick={handleAdd} disabled={saving}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground"
                        data-testid="participant-confirm-add"
                      >{saving ? "Tilføjer..." : "Tilføj"}</Button>
                    </>
                  ) : (
                    <Button type="button" variant="ghost" onClick={() => setAddOpen(false)} data-testid="participant-close">
                      Luk
                    </Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
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
              <TableHead className="w-24 text-center">Mødt op</TableHead>
              <TableHead>Note</TableHead>
              {isAdmin && <TableHead className="w-24 text-right">Handling</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {participants.length === 0 && (
              <TableRow>
                <TableCell colSpan={isAdmin ? 8 : 7} className="text-center text-sm text-muted-foreground py-10">
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
                  <TableCell className="align-top text-center">
                    <Checkbox
                      checked={!!p.checked_in}
                      onCheckedChange={() => isAdmin && handleToggleCheckedIn(p)}
                      disabled={!isAdmin}
                      data-testid={`checkin-checkbox-${p.id}`}
                      aria-label="Mødt op"
                    />
                  </TableCell>
                  <TableCell className="align-top text-sm text-muted-foreground whitespace-pre-line">
                    {p.note || <span className="italic text-muted-foreground/60">Ingen note</span>}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="align-top">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon" variant="ghost"
                          onClick={() => openEditParticipant(p)}
                          title="Rediger tilmelding"
                          data-testid={`edit-participant-${p.id}`}
                        >
                          <Pencil className="w-4 h-4" strokeWidth={1.6} />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="icon" variant="ghost"
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
                              >Fjern</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Edit participant dialog */}
      <Dialog open={!!editP} onOpenChange={(o) => !o && setEditP(null)}>
        <DialogContent className="bg-white" data-testid="edit-participant-dialog">
          <DialogHeader>
            <DialogTitle>Rediger tilmelding{editP ? ` – ${editP.navn}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-num-members">Antal medlemmer</Label>
                <Input
                  id="edit-num-members" type="number" min="0"
                  value={editForm.num_members}
                  onChange={(e) => setEditForm({ ...editForm, num_members: e.target.value })}
                  data-testid="edit-num-members-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-num-non-members">Antal ikke-medlemmer</Label>
                <Input
                  id="edit-num-non-members" type="number" min="0"
                  value={editForm.num_non_members}
                  onChange={(e) => setEditForm({ ...editForm, num_non_members: e.target.value })}
                  data-testid="edit-num-non-members-input"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              I alt: <strong>{(Number(editForm.num_members) || 0) + (Number(editForm.num_non_members) || 0)}</strong> deltagere
            </p>
            <div className="space-y-2">
              <Label htmlFor="edit-note">Note</Label>
              <Textarea
                id="edit-note"
                value={editForm.note}
                onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                rows={3}
                data-testid="edit-note-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditP(null)} data-testid="edit-participant-cancel">Annullér</Button>
            <Button
              onClick={handleSaveEditParticipant}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              data-testid="edit-participant-save"
            >Gem ændringer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit event dialog */}
      <Dialog open={eventEditOpen} onOpenChange={setEventEditOpen}>
        <DialogContent className="bg-white" data-testid="edit-event-dialog">
          <DialogHeader>
            <DialogTitle>Rediger arrangement</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveEvent} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ev-title">Titel</Label>
              <Input
                id="ev-title"
                value={eventForm.title}
                onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                required
                data-testid="edit-event-title-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="ev-date">Dato</Label>
                <Input
                  id="ev-date" type="date"
                  value={eventForm.event_date || ""}
                  onChange={(e) => setEventForm({ ...eventForm, event_date: e.target.value })}
                  data-testid="edit-event-date-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ev-time">Tidspunkt</Label>
                <Input
                  id="ev-time" type="time"
                  value={eventForm.event_time || ""}
                  onChange={(e) => setEventForm({ ...eventForm, event_time: e.target.value })}
                  data-testid="edit-event-time-input"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-location">Sted</Label>
              <Input
                id="ev-location"
                value={eventForm.location}
                onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })}
                data-testid="edit-event-location-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="ev-pm">Pris medlem (kr.)</Label>
                <Input
                  id="ev-pm" type="number" min="0" step="0.01"
                  value={eventForm.price_member}
                  onChange={(e) => setEventForm({ ...eventForm, price_member: e.target.value })}
                  data-testid="edit-event-price-member-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ev-pnm">Pris ikke-medlem (kr.)</Label>
                <Input
                  id="ev-pnm" type="number" min="0" step="0.01"
                  value={eventForm.price_non_member}
                  onChange={(e) => setEventForm({ ...eventForm, price_non_member: e.target.value })}
                  data-testid="edit-event-price-non-member-input"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-desc">Beskrivelse</Label>
              <Textarea
                id="ev-desc"
                value={eventForm.description}
                onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                rows={3}
                data-testid="edit-event-description-input"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEventEditOpen(false)} data-testid="edit-event-cancel">
                Annullér
              </Button>
              <Button
                type="submit"
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                data-testid="edit-event-save"
              >Gem</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
