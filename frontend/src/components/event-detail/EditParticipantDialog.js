import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export default function EditParticipantDialog({ participant, eventId, onClose, onSaved }) {
  const [form, setForm] = useState({ num_members: 1, num_non_members: 0, note: "" });

  useEffect(() => {
    if (participant) {
      setForm({
        num_members: participant.num_members ?? 1,
        num_non_members: participant.num_non_members ?? 0,
        note: participant.note ?? "",
      });
    }
  }, [participant]);

  const handleSave = async () => {
    if (!participant) return;
    const nm = Number(form.num_members) || 0;
    const nnm = Number(form.num_non_members) || 0;
    if (nm + nnm < 1) { toast.error("Antal skal være mindst 1"); return; }
    try {
      await api.patch(`/events/${eventId}/participants/${participant.id}`, {
        num_members: nm, num_non_members: nnm, note: form.note,
      });
      toast.success("Tilmelding opdateret");
      onClose();
      await onSaved?.();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  return (
    <Dialog open={!!participant} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-white max-h-[90vh] overflow-y-auto" data-testid="edit-participant-dialog">
        <DialogHeader>
          <DialogTitle>Rediger tilmelding{participant ? ` – ${participant.navn}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-num-members">Antal medlemmer</Label>
              <Input
                id="edit-num-members" type="number" min="0"
                value={form.num_members}
                onChange={(e) => setForm({ ...form, num_members: e.target.value })}
                data-testid="edit-num-members-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-num-non-members">Antal ikke-medlemmer</Label>
              <Input
                id="edit-num-non-members" type="number" min="0"
                value={form.num_non_members}
                onChange={(e) => setForm({ ...form, num_non_members: e.target.value })}
                data-testid="edit-num-non-members-input"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            I alt: <strong>{(Number(form.num_members) || 0) + (Number(form.num_non_members) || 0)}</strong> deltagere
          </p>
          <div className="space-y-2">
            <Label htmlFor="edit-note">Note</Label>
            <Textarea
              id="edit-note"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              rows={3}
              data-testid="edit-note-input"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="edit-participant-cancel">Annullér</Button>
          <Button
            onClick={handleSave}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
            data-testid="edit-participant-save"
          >Gem ændringer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
