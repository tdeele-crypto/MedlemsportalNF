import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Pencil } from "lucide-react";
import StoredImage from "@/components/StoredImage";

export default function EventHeader({ event, isAdmin, participantsCount, onEdit }) {
  const hasPrices = (event.price_member ?? 0) > 0 || (event.price_non_member ?? 0) > 0;
  const deadline = event.registration_deadline
    ? new Date(event.registration_deadline)
    : null;
  const deadlinePast = deadline && deadline < new Date(new Date().toDateString());

  return (
    <>
      {event.image_path && (
        <div className="mt-4 rounded-md overflow-hidden border border-border bg-muted">
          <StoredImage
            path={event.image_path}
            className="w-full h-48 sm:h-64 object-cover"
            alt={event.title}
            data-testid="event-hero-image"
          />
        </div>
      )}

      <div className="mt-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight" data-testid="event-title">
              {event.title}
            </h1>
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={onEdit} data-testid="edit-event-button">
                <Pencil className="w-3.5 h-3.5 mr-2" strokeWidth={1.6} />
                Rediger arrangement
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
            {event.address && (
              <span className="flex items-center gap-1.5 text-muted-foreground/80">
                {!event.location && <MapPin className="w-4 h-4" strokeWidth={1.5} />}
                {event.address}
              </span>
            )}
            {deadline && (
              <span
                className={`flex items-center gap-1.5 ${deadlinePast ? "text-destructive" : ""}`}
                data-testid="event-deadline"
              >
                ⏳ Tilmeldingsfrist:{" "}
                {deadline.toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" })}
                {deadlinePast && " (udløbet)"}
              </span>
            )}
          </div>
          {event.description && (
            <p className="mt-3 text-sm text-foreground/80 max-w-2xl leading-relaxed">{event.description}</p>
          )}
          {event.contact_name && (
            <div className="mt-3 inline-block border border-border bg-muted/30 rounded-md px-3 py-2 text-sm" data-testid="event-contact-card">
              <div className="label-tiny mb-0.5">Tilmelding til</div>
              <div className="font-medium">{event.contact_name}</div>
              <div className="text-xs text-muted-foreground">
                {event.contact_email && (
                  <a href={`mailto:${event.contact_email}`} className="text-primary hover:underline">{event.contact_email}</a>
                )}
                {event.contact_email && event.contact_phone && " · "}
                {event.contact_phone && (
                  <a href={`tel:${event.contact_phone}`} className="text-primary hover:underline">{event.contact_phone}</a>
                )}
              </div>
            </div>
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
          <div className="text-xs text-muted-foreground uppercase tracking-wider">
            {event.max_participants ? `af ${event.max_participants} deltagere` : "deltagere i alt"}
          </div>
          {event.max_participants != null && (
            <div
              className={`mt-1 text-xs font-medium ${
                event.free_spots === 0 ? "text-destructive"
                : event.free_spots <= 5 ? "text-amber-600"
                : "text-primary"
              }`}
              data-testid="free-spots"
            >
              {event.free_spots === 0 ? "Arrangementet er fuldt" : `${event.free_spots} ledige pladser`}
            </div>
          )}
          <div className="mt-2 text-xs text-muted-foreground">
            <span data-testid="total-members">{event.total_members ?? 0}</span> medlem{(event.total_members ?? 0) === 1 ? "" : "mer"}
            {" · "}
            <span data-testid="total-non-members">{event.total_non_members ?? 0}</span> ikke-medl.
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {participantsCount} tilmelding{participantsCount === 1 ? "" : "er"}
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
    </>
  );
}
