import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Pencil, Send, Trash2 } from "lucide-react";

export default function ParticipantsTable({
  participants, isAdmin, onTogglePaid, onToggleCheckedIn, onEdit, onRemove,
}) {
  return (
    <>
      {/* Mobile: card list — no horizontal scroll */}
      <div className="mt-4 md:hidden space-y-3" data-testid="participants-list-mobile">
        {participants.length === 0 ? (
          <div className="border border-dashed border-border rounded-md bg-white p-8 text-center text-sm text-muted-foreground">
            Ingen deltagere endnu.
          </div>
        ) : (
          participants.map((p) => (
            <ParticipantCard
              key={p.id}
              p={p}
              isAdmin={isAdmin}
              onTogglePaid={onTogglePaid}
              onToggleCheckedIn={onToggleCheckedIn}
              onEdit={onEdit}
              onRemove={onRemove}
            />
          ))
        )}
      </div>

      {/* Desktop: table */}
      <div className="mt-4 border border-border rounded-md bg-white overflow-hidden hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-20">Medl. nr.</TableHead>
              <TableHead>Navn & adresse</TableHead>
              <TableHead>Kontakt</TableHead>
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
            {participants.map((p) => (
              <ParticipantRow
                key={p.id}
                p={p}
                isAdmin={isAdmin}
                onTogglePaid={onTogglePaid}
                onToggleCheckedIn={onToggleCheckedIn}
                onEdit={onEdit}
                onRemove={onRemove}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

// ---- Mobile card ----
function ParticipantCard({ p, isAdmin, onTogglePaid, onToggleCheckedIn, onEdit, onRemove }) {
  const nm = p.num_members || 0;
  const nmf = p.num_members_free || 0;
  const nnm = p.num_non_members || 0;
  const nnmf = p.num_non_members_free || 0;
  const total = nm + nnm;
  const addressExtra = p.adresse ? p.adresse.split("\n").slice(1).join(", ") : "";
  return (
    <div
      data-testid={`participant-row-${p.id}`}
      className={`border border-border rounded-md p-4 ${p.paid ? "bg-primary/5" : "bg-white"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground">
            #{p.medlemsnummer}
          </div>
          <div className="font-medium text-foreground break-words">{p.navn}</div>
          {addressExtra && (
            <div className="text-xs text-muted-foreground mt-0.5 break-words">{addressExtra}</div>
          )}
          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {p.email && (
              <span className="inline-flex items-center gap-1 break-all">
                {p.email}
                {p.reminder_sent && (
                  <span title="Påmindelse sendt" data-testid={`reminder-sent-${p.id}`}>
                    <Send className="w-3 h-3 text-primary" strokeWidth={1.8} />
                  </span>
                )}
              </span>
            )}
            {p.telefon && <span>· {p.telefon}</span>}
          </div>
        </div>
        <div
          className="shrink-0 text-right"
          data-testid={`participant-count-${p.id}`}
        >
          <div className="text-2xl font-bold text-primary leading-none">{total}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
            {nm} m{nmf > 0 ? ` (${nmf} gratis)` : ""} · {nnm} im{nnmf > 0 ? ` (${nnmf} gratis)` : ""}
          </div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox
            checked={!!p.paid}
            onCheckedChange={() => isAdmin && onTogglePaid(p)}
            disabled={!isAdmin}
            data-testid={`paid-checkbox-${p.id}`}
            aria-label="Betalt"
          />
          <span>Betalt</span>
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox
            checked={!!p.checked_in}
            onCheckedChange={() => isAdmin && onToggleCheckedIn(p)}
            disabled={!isAdmin}
            data-testid={`checkin-checkbox-${p.id}`}
            aria-label="Mødt op"
          />
          <span>Mødt op</span>
        </label>
      </div>

      {p.note && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Note
          </div>
          <div className="text-sm text-foreground/80 whitespace-pre-line break-words">
            {p.note}
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onEdit(p)}
            data-testid={`edit-participant-${p.id}`}
          >
            <Pencil className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.6} />
            Rediger
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                data-testid={`remove-participant-${p.id}`}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.6} />
                Fjern
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
                  onClick={() => onRemove(p.id)}
                  className="bg-destructive hover:bg-destructive/90"
                  data-testid={`remove-confirm-${p.id}`}
                >Fjern</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

// ---- Desktop row (unchanged) ----
function ParticipantRow({ p, isAdmin, onTogglePaid, onToggleCheckedIn, onEdit, onRemove }) {
  const nm = p.num_members || 0;
  const nmf = p.num_members_free || 0;
  const nnm = p.num_non_members || 0;
  const nnmf = p.num_non_members_free || 0;
  const total = nm + nnm;
  return (
    <TableRow data-testid={`participant-row-desktop-${p.id}`} className={p.paid ? "bg-primary/5" : ""}>
      <TableCell className="font-mono text-xs align-top">{p.medlemsnummer}</TableCell>
      <TableCell className="align-top">
        <div className="font-medium">{p.navn}</div>
        {p.adresse && (
          <div className="text-xs text-muted-foreground whitespace-pre-line mt-0.5">
            {p.adresse.split("\n").slice(1).join(", ")}
          </div>
        )}
      </TableCell>
      <TableCell className="text-sm align-top">
        <div className="flex items-center gap-1.5">
          <span>{p.email}</span>
          {p.reminder_sent && p.email && (
            <span title="Påmindelse sendt">
              <Send className="w-3 h-3 text-primary" strokeWidth={1.8} />
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">{p.telefon}</div>
      </TableCell>
      <TableCell className="align-top text-sm">
        <div className="font-semibold">{total}</div>
        <div className="text-xs text-muted-foreground">
          {nm} medl.{nmf > 0 ? ` (${nmf} gratis)` : ""} · {nnm} ikke-m.{nnmf > 0 ? ` (${nnmf} gratis)` : ""}
        </div>
      </TableCell>
      <TableCell className="align-top text-center">
        <Checkbox
          checked={!!p.paid}
          onCheckedChange={() => isAdmin && onTogglePaid(p)}
          disabled={!isAdmin}
          data-testid={`paid-checkbox-desktop-${p.id}`}
          aria-label="Betalt"
        />
      </TableCell>
      <TableCell className="align-top text-center">
        <Checkbox
          checked={!!p.checked_in}
          onCheckedChange={() => isAdmin && onToggleCheckedIn(p)}
          disabled={!isAdmin}
          data-testid={`checkin-checkbox-desktop-${p.id}`}
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
              size="icon"
              variant="ghost"
              onClick={() => onEdit(p)}
              title="Rediger tilmelding"
              data-testid={`edit-participant-desktop-${p.id}`}
            >
              <Pencil className="w-4 h-4" strokeWidth={1.6} />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  data-testid={`remove-participant-desktop-${p.id}`}
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
                  <AlertDialogCancel>Annullér</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => onRemove(p.id)}
                    className="bg-destructive hover:bg-destructive/90"
                  >Fjern</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}
