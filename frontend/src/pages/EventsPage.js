import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import EventImageUpload from "@/components/EventImageUpload";
import StoredImage from "@/components/StoredImage";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Calendar, MapPin, ArrowRight, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

export default function EventsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [events, setEvents] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", location: "", address: "", event_date: "", event_time: "", price_member: "", price_non_member: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/events");
      setEvents(data);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/events", {
        ...form,
        price_member: Number(form.price_member) || 0,
        price_non_member: Number(form.price_non_member) || 0,
      });
      setOpen(false);
      setForm({ title: "", description: "", location: "", address: "", event_date: "", event_time: "", price_member: "", price_non_member: "", email_on_register: true, email_on_paid: true, email_on_reminder: true, image_path: null });
      await load();
      toast.success("Arrangement oprettet");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto" data-testid="events-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Arrangementer</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {events.length} arrangement{events.length === 1 ? "" : "er"}
          </p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                data-testid="create-event-button"
              >
                <Plus className="w-4 h-4 mr-2" strokeWidth={1.6} />
                Nyt arrangement
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white max-h-[90vh] overflow-y-auto" data-testid="create-event-dialog">
              <DialogHeader>
                <DialogTitle>Opret arrangement</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Titel</Label>
                  <Input
                    id="title"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    required
                    data-testid="event-title-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Billede (valgfri)</Label>
                  <EventImageUpload
                    value={form.image_path}
                    onChange={(p) => setForm({ ...form, image_path: p })}
                    data-testid="event-image-upload"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="event_date">Dato</Label>
                    <Input
                      id="event_date"
                      type="date"
                      value={form.event_date}
                      onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                      data-testid="event-date-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="event_time">Tidspunkt</Label>
                    <Input
                      id="event_time"
                      type="time"
                      value={form.event_time}
                      onChange={(e) => setForm({ ...form, event_time: e.target.value })}
                      data-testid="event-time-input"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Vi mødes her</Label>
                  <Input
                    id="location"
                    placeholder="F.eks. Klubhuset, Café Nord..."
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    data-testid="event-location-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Adresse</Label>
                  <AddressAutocomplete
                    value={form.address}
                    onChange={(v) => setForm({ ...form, address: v })}
                    data-testid="event-address-input"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="price_member">Pris medlem (kr.)</Label>
                    <Input
                      id="price_member"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0"
                      value={form.price_member}
                      onChange={(e) => setForm({ ...form, price_member: e.target.value })}
                      data-testid="event-price-member-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="price_non_member">Pris ikke-medlem (kr.)</Label>
                    <Input
                      id="price_non_member"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0"
                      value={form.price_non_member}
                      onChange={(e) => setForm({ ...form, price_non_member: e.target.value })}
                      data-testid="event-price-non-member-input"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Beskrivelse</Label>
                  <Textarea
                    id="description"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={3}
                    data-testid="event-description-input"
                  />
                </div>
                <div className="space-y-2 pt-2 border-t border-border">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Email-notifikationer</Label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={form.email_on_register}
                        onCheckedChange={(v) => setForm({ ...form, email_on_register: !!v })}
                        data-testid="event-email-register"
                      />
                      <span>Send mail ved tilmelding</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={form.email_on_paid}
                        onCheckedChange={(v) => setForm({ ...form, email_on_paid: !!v })}
                        data-testid="event-email-paid"
                      />
                      <span>Send mail når betaling registreres</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={form.email_on_reminder}
                        onCheckedChange={(v) => setForm({ ...form, email_on_reminder: !!v })}
                        data-testid="event-email-reminder"
                      />
                      <span>Send påmindelse 2 dage før</span>
                    </label>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)} data-testid="event-cancel">
                    Annullér
                  </Button>
                  <Button
                    type="submit"
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    disabled={saving}
                    data-testid="event-save-button"
                  >
                    {saving ? "Gemmer..." : "Opret"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        {events.length === 0 && (
          <div className="md:col-span-2 border border-dashed border-border rounded-md p-12 text-center bg-white">
            <Calendar className="w-8 h-8 mx-auto text-muted-foreground" strokeWidth={1.5} />
            <p className="mt-3 text-sm text-muted-foreground">Ingen arrangementer endnu.</p>
            {isAdmin && (
              <p className="text-xs text-muted-foreground mt-1">Klik på &quot;Nyt arrangement&quot; for at oprette det første.</p>
            )}
          </div>
        )}
        {events.map((ev) => (
          <Link
            to={`/arrangementer/${ev.id}`}
            key={ev.id}
            data-testid={`event-card-${ev.id}`}
            className="group border border-border rounded-md bg-white overflow-hidden hover:border-primary/40 transition-colors flex flex-col"
          >
            {ev.image_path ? (
              <StoredImage
                path={ev.image_path}
                className="w-full h-36 object-cover"
                alt={ev.title}
                data-testid={`event-card-image-${ev.id}`}
              />
            ) : (
              <div className="w-full h-2 bg-primary/10" />
            )}
            <div className="p-6 flex-1 flex flex-col">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg text-foreground truncate">{ev.title}</h3>
                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {ev.event_date && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" strokeWidth={1.5} />
                      {new Date(ev.event_date).toLocaleDateString("da-DK", {
                        weekday: "short",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                      {ev.event_time && <span className="ml-1">kl. {ev.event_time}</span>}
                    </div>
                  )}
                  {ev.location && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" strokeWidth={1.5} />
                      <span>
                        {ev.location}
                        {ev.address && <span className="text-muted-foreground/80"> · {ev.address}</span>}
                      </span>
                    </div>
                  )}
                  {!ev.location && ev.address && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" strokeWidth={1.5} />
                      {ev.address}
                    </div>
                  )}
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" strokeWidth={1.6} />
            </div>
            <div className="mt-4 pt-4 border-t border-border flex items-baseline justify-between">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-primary">{ev.total_attendees ?? ev.participant_count}</span>
                <span className="text-xs text-muted-foreground">deltagere</span>
              </div>
              {(ev.price_member > 0 || ev.price_non_member > 0) && (
                <div className="text-xs text-muted-foreground text-right">
                  <div>{ev.price_member} kr. / medlem</div>
                  <div>{ev.price_non_member} kr. / ikke-medl.</div>
                </div>
              )}
            </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
