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
  const [form, setForm] = useState({
    num_members: 1, num_members_free: 0,
    num_non_members: 0, num_non_members_free: 0,
    note: "",
  });

  useEffect(() => {
    if (participant) {
      setForm({
        num_members: participant.num_members ?? 1,
        num_members_free: participant.num_members_free ?? 0,
        num_non_members: participant.num_non_members ?? 0,
        num_non_members_free: participant.num_non_members_free ?? 0,
        note: participant.note ?? "",
      });
    }
  }, [participant]);

  const nm = Number(form.num_members) || 0;
  const nmf = Number(form.num_members_free) || 0;
  const nnm = Number(form.num_non_members) || 0;
  const nnmf = Number(form.num_non_members_free) || 0;
  const total = nm + nnm;
  const membersFreeError = nmf > nm;
  const nonMembersFreeError = nnmf > nnm;
  const hasError = membersFreeError || nonMembersFreeError;

  const handleSave = async () => {
    if (!participant) return;
    if (nm + nnm < 1) { toast.error("Antal skal være mindst 1"); return; }
    if (hasError) {
      toast.error("Antal gratis kan ikke overstige antal tilmeldte");
      return;
    }
    try {
      await api.patch(`/events/${eventId}/participants/${participant.id}`, {
        num_members: nm, num_members_free: nmf,
        num_non_members: nnm, num_non_members_free: nnmf,
        note: form.note,
      });
      toast.success("Tilmelding opdateret");
      onClose();
      await onSaved?.();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  return (
    <Dialog open={!!participant} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="bg-white max-w-[calc(100vw-1rem)] sm:max-w-xl max-h-[90vh] overflow-y-auto"
        data-testid="edit-participant-dialog"
      >
        <DialogHeader>
          <DialogTitle>Rediger tilmelding{participant ? ` – ${participant.navn}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Members pair */}
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
              <Label htmlFor="edit-num-members-free">Hvoraf er gratis</Label>
              <Input
                id="edit-num-members-free" type="number" min="0"
                value={form.num_members_free}
                onChange={(e) => setForm({ ...form, num_members_free: e.target.value })}
                data-testid="edit-num-members-free-input"
                aria-invalid={membersFreeError}
                className={membersFreeError ? "border-destructive focus-visible:ring-destructive" : ""}
              />
            </div>
          </div>
          {/* Non-members pair */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-num-non-members">Antal ikke-medlemmer</Label>
              <Input
                id="edit-num-non-members" type="number" min="0"
                value={form.num_non_members}
                onChange={(e) => setForm({ ...form, num_non_members: e.target.value })}
                data-testid="edit-num-non-members-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-num-non-members-free">Hvoraf er gratis</Label>
              <Input
                id="edit-num-non-members-free" type="number" min="0"
                value={form.num_non_members_free}
                onChange={(e) => setForm({ ...form, num_non_members_free: e.target.value })}
                data-testid="edit-num-non-members-free-input"
                aria-invalid={nonMembersFreeError}
                className={nonMembersFreeError ? "border-destructive focus-visible:ring-destructive" : ""}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground" data-testid="edit-participant-total">
            I alt: <strong>{total}</strong> deltager{total === 1 ? "" : "e"}
            {(nmf > 0 || nnmf > 0) && !hasError && (
              <span> · <strong>{nmf + nnmf}</strong> gratis</span>
            )}
          </p>
          {membersFreeError && (
            <p className="text-xs text-destructive" data-testid="edit-participant-members-free-error">
              Gratis medlemmer ({nmf}) kan ikke overstige antal medlemmer ({nm}).
            </p>
          )}
          {nonMembersFreeError && (
            <p className="text-xs text-destructive" data-testid="edit-participant-non-members-free-error">
              Gratis ikke-medlemmer ({nnmf}) kan ikke overstige antal ikke-medlemmer ({nnm}).
            </p>
          )}
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
            disabled={hasError}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
            data-testid="edit-participant-save"
          >Gem ændringer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
