import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import EventImageUpload from "@/components/EventImageUpload";
import MemberSelector from "@/components/MemberSelector";
import { toast } from "sonner";

const emptyForm = {
  title: "", description: "", location: "", address: "",
  event_date: "", event_time: "", registration_deadline: "",
  price_member: "", price_non_member: "", max_participants: "",
  email_on_register: true, email_on_paid: true, email_on_reminder: true,
  image_path: null, contact_member: null,
};

const formFromEvent = (event) => ({
  title: event.title || "",
  description: event.description || "",
  location: event.location || "",
  address: event.address || "",
  event_date: event.event_date || "",
  event_time: event.event_time || "",
  registration_deadline: event.registration_deadline || "",
  price_member: event.price_member ?? "",
  price_non_member: event.price_non_member ?? "",
  max_participants: event.max_participants ?? "",
  email_on_register: event.email_on_register !== false,
  email_on_paid: event.email_on_paid !== false,
  email_on_reminder: event.email_on_reminder !== false,
  image_path: event.image_path || null,
  contact_member: event.contact_member_id ? {
    id: event.contact_member_id,
    navn: event.contact_name || "",
    email: event.contact_email || "",
    telefon: event.contact_phone || "",
  } : null,
});

export default function EditEventDialog({ open, onOpenChange, event, onSaved }) {
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (open && event) setForm(formFromEvent(event));
  }, [open, event]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/events/${event.id}`, {
        ...form,
        contact_member_id: form.contact_member?.id || null,
        price_member: Number(form.price_member) || 0,
        price_non_member: Number(form.price_non_member) || 0,
        max_participants: form.max_participants ? Number(form.max_participants) : null,
      });
      onOpenChange(false);
      toast.success("Arrangement opdateret");
      await onSaved?.();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white max-h-[90vh] overflow-y-auto" data-testid="edit-event-dialog">
        <DialogHeader>
          <DialogTitle>Rediger arrangement</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ev-title">Titel</Label>
            <Input
              id="ev-title"
              value={form.title}
              onChange={(e) => set({ title: e.target.value })}
              required
              data-testid="edit-event-title-input"
            />
          </div>
          <div className="space-y-2">
            <Label>Billede</Label>
            <EventImageUpload
              value={form.image_path}
              onChange={(p) => set({ image_path: p })}
              data-testid="edit-event-image-upload"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="ev-date">Dato</Label>
              <Input
                id="ev-date" type="date"
                value={form.event_date || ""}
                onChange={(e) => set({ event_date: e.target.value })}
                data-testid="edit-event-date-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-time">Tidspunkt</Label>
              <Input
                id="ev-time" type="time"
                value={form.event_time || ""}
                onChange={(e) => set({ event_time: e.target.value })}
                data-testid="edit-event-time-input"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ev-deadline">Senest tilmeldingsfrist</Label>
            <Input
              id="ev-deadline" type="date"
              value={form.registration_deadline || ""}
              onChange={(e) => set({ registration_deadline: e.target.value })}
              data-testid="edit-event-deadline-input"
            />
          </div>
          <div className="space-y-2">
            <Label>Tilmelding til (medlem)</Label>
            <MemberSelector
              value={form.contact_member}
              onChange={(m) => set({ contact_member: m })}
              data-testid="edit-event-contact-selector"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ev-location">Vi mødes her</Label>
            <Input
              id="ev-location"
              placeholder="F.eks. Klubhuset, Café Nord..."
              value={form.location}
              onChange={(e) => set({ location: e.target.value })}
              data-testid="edit-event-location-input"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ev-address">Adresse</Label>
            <AddressAutocomplete
              value={form.address}
              onChange={(v) => set({ address: v })}
              data-testid="edit-event-address-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="ev-pm">Pris medlem (kr.)</Label>
              <Input
                id="ev-pm" type="number" min="0" step="0.01"
                value={form.price_member}
                onChange={(e) => set({ price_member: e.target.value })}
                data-testid="edit-event-price-member-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-pnm">Pris ikke-medlem (kr.)</Label>
              <Input
                id="ev-pnm" type="number" min="0" step="0.01"
                value={form.price_non_member}
                onChange={(e) => set({ price_non_member: e.target.value })}
                data-testid="edit-event-price-non-member-input"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ev-max">Max antal deltagere (valgfri)</Label>
            <Input
              id="ev-max" type="number" min="1"
              placeholder="Ingen begrænsning"
              value={form.max_participants}
              onChange={(e) => set({ max_participants: e.target.value })}
              data-testid="edit-event-max-participants-input"
            />
            <p className="text-xs text-muted-foreground">Lad stå tom for ingen øvre grænse.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ev-desc">Beskrivelse</Label>
            <Textarea
              id="ev-desc"
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
              rows={3}
              data-testid="edit-event-description-input"
            />
          </div>
          <div className="space-y-2 pt-2 border-t border-border">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Email-notifikationer</Label>
            <div className="space-y-2">
              <CheckboxRow
                label="Send mail ved tilmelding"
                checked={form.email_on_register}
                onChange={(v) => set({ email_on_register: !!v })}
                testId="edit-event-email-register"
              />
              <CheckboxRow
                label="Send mail når betaling registreres"
                checked={form.email_on_paid}
                onChange={(v) => set({ email_on_paid: !!v })}
                testId="edit-event-email-paid"
              />
              <CheckboxRow
                label="Send påmindelse 2 dage før"
                checked={form.email_on_reminder}
                onChange={(v) => set({ email_on_reminder: !!v })}
                testId="edit-event-email-reminder"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} data-testid="edit-event-cancel">
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
  );
}

function CheckboxRow({ label, checked, onChange, testId }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={onChange} data-testid={testId} />
      <span>{label}</span>
    </label>
  );
}
