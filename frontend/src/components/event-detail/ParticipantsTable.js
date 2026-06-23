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
  );
}

function ParticipantRow({ p, isAdmin, onTogglePaid, onToggleCheckedIn, onEdit, onRemove }) {
  const total = (p.num_members || 0) + (p.num_non_members || 0);
  return (
    <TableRow data-testid={`participant-row-${p.id}`} className={p.paid ? "bg-primary/5" : ""}>
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
        <div className="flex items-center gap-1.5">
          <span>{p.email}</span>
          {p.reminder_sent && p.email && (
            <span title="Påmindelse sendt" data-testid={`reminder-sent-${p.id}`}>
              <Send className="w-3 h-3 text-primary" strokeWidth={1.8} />
            </span>
          )}
        </div>
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
          onCheckedChange={() => isAdmin && onTogglePaid(p)}
          disabled={!isAdmin}
          data-testid={`paid-checkbox-${p.id}`}
          aria-label="Betalt"
        />
      </TableCell>
      <TableCell className="align-top text-center">
        <Checkbox
          checked={!!p.checked_in}
          onCheckedChange={() => isAdmin && onToggleCheckedIn(p)}
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
              size="icon"
              variant="ghost"
              onClick={() => onEdit(p)}
              title="Rediger tilmelding"
              data-testid={`edit-participant-${p.id}`}
            >
              <Pencil className="w-4 h-4" strokeWidth={1.6} />
            </Button>
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
                    onClick={() => onRemove(p.id)}
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
}
