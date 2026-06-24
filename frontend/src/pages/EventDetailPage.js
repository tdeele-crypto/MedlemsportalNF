import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Plus, Download, ScanLine, Facebook,
} from "lucide-react";
import { toast } from "sonner";

import EventHeader from "@/components/event-detail/EventHeader";
import FinanceWidget from "@/components/event-detail/FinanceWidget";
import ParticipantsTable from "@/components/event-detail/ParticipantsTable";
import AddParticipantDialog from "@/components/event-detail/AddParticipantDialog";
import EditParticipantDialog from "@/components/event-detail/EditParticipantDialog";
import EditEventDialog from "@/components/event-detail/EditEventDialog";
import FacebookShareDialog from "@/components/event-detail/FacebookShareDialog";
import { buildFacebookPostText } from "@/components/event-detail/utils";

export default function EventDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canEdit = isAdmin || user?.role === "editor";

  const [event, setEvent] = useState(null);
  const [participants, setParticipants] = useState([]);

  const [addOpen, setAddOpen] = useState(false);
  const [editP, setEditP] = useState(null);
  const [eventEditOpen, setEventEditOpen] = useState(false);
  const [fbShareOpen, setFbShareOpen] = useState(false);
  const [fbShareText, setFbShareText] = useState("");

  const loadEvent = useCallback(async () => {
    try {
      const [e, p] = await Promise.all([
        api.get(`/events/${id}`),
        api.get(`/events/${id}/participants`),
      ]);
      setEvent(e.data);
      setParticipants(p.data);
    } catch (err) { toast.error(formatApiError(err)); }
  }, [id]);

  useEffect(() => { loadEvent(); }, [loadEvent]);

  const enrolledMemberIds = useMemo(
    () => participants.map((p) => p.member_id),
    [participants]
  );

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

  const handleShareFacebook = () => {
    if (!event) return;
    setFbShareText(buildFacebookPostText(event));
    setFbShareOpen(true);
  };

  if (!event) {
    return <div className="p-10 text-sm text-muted-foreground" data-testid="event-detail-loading">Indlæser arrangement...</div>;
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

      <EventHeader
        event={event}
        isAdmin={isAdmin}
        participantsCount={participants.length}
        onEdit={() => setEventEditOpen(true)}
      />

      <FinanceWidget event={event} />

      <div className="mt-10 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xl font-semibold tracking-tight">Deltagere</h2>
        <div className="flex items-center gap-2">
          {participants.length > 0 && canEdit && (
            <Link to={`/arrangementer/${id}/check-in`} data-testid="quick-checkin-link">
              <Button variant="outline">
                <ScanLine className="w-4 h-4 mr-2" strokeWidth={1.6} />
                Hurtig check-in
              </Button>
            </Link>
          )}
          {participants.length > 0 && (
            <Button variant="outline" onClick={handleExportCsv} data-testid="export-csv-button">
              <Download className="w-4 h-4 mr-2" strokeWidth={1.6} />
              Eksportér CSV
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="outline"
              onClick={handleShareFacebook}
              data-testid="facebook-share-button"
              className="border-[#1877F2]/30 text-[#1877F2] hover:bg-[#1877F2]/5 hover:text-[#1877F2]"
            >
              <Facebook className="w-4 h-4 mr-2" strokeWidth={1.6} />
              Del på Facebook
            </Button>
          )}
          {canEdit && (
            <Button
              onClick={() => setAddOpen(true)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              data-testid="add-participant-button"
            >
              <Plus className="w-4 h-4 mr-2" strokeWidth={1.6} />
              Tilføj deltager
            </Button>
          )}
        </div>
      </div>

      <ParticipantsTable
        participants={participants}
        isAdmin={canEdit}
        onTogglePaid={handleTogglePaid}
        onToggleCheckedIn={handleToggleCheckedIn}
        onEdit={setEditP}
        onRemove={handleRemove}
      />

      <AddParticipantDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        eventId={id}
        enrolledMemberIds={enrolledMemberIds}
        onAdded={loadEvent}
      />

      <EditParticipantDialog
        participant={editP}
        eventId={id}
        onClose={() => setEditP(null)}
        onSaved={loadEvent}
      />

      <EditEventDialog
        open={eventEditOpen}
        onOpenChange={setEventEditOpen}
        event={event}
        onSaved={loadEvent}
      />

      <FacebookShareDialog
        open={fbShareOpen}
        onOpenChange={setFbShareOpen}
        event={event}
        initialText={fbShareText}
      />
    </div>
  );
}
