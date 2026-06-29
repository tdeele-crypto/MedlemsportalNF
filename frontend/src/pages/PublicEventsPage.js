import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";

const LOGO_URL = "https://customer-assets.emergentagent.com/job_member-events-3/artifacts/zysp8e23_nflogo.jpg";

const fmtDateDk = (date, time) => {
  if (!date) return "";
  try {
    const d = new Date(date);
    const days = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
    const months = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];
    let s = `${days[d.getDay()]} d. ${d.getDate()}. ${months[d.getMonth()]} ${d.getFullYear()}`;
    if (time) s += ` kl. ${time}`;
    return s;
  } catch { return date; }
};

const fmtDeadlineDk = (date) => {
  if (!date) return "";
  try {
    const d = new Date(date);
    const days = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
    const months = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];
    return `${days[d.getDay()]} d. ${d.getDate()}. ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch { return date; }
};

const fmtPrice = (member, nonMember) => {
  if ((member ?? 0) <= 0 && (nonMember ?? 0) <= 0) return "Gratis";
  if ((member ?? 0) > 0 && (nonMember ?? 0) > 0 && member !== nonMember) {
    return `${member} kr. (medlem) / ${nonMember} kr. (ikke-medlem)`;
  }
  return `${member || nonMember} kr.`;
};

export default function PublicEventsPage() {
  const { token } = useParams();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const url = `${process.env.REACT_APP_BACKEND_URL}/api/public/events/${token}`;
        const { data } = await axios.get(url);
        setEvents(data);
      } catch (err) {
        setError(err.response?.status === 404 ? "not_found" : "error");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-sm text-muted-foreground">
        Indlæser arrangementer...
      </div>
    );
  }

  if (error === "not_found") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold tracking-tight">Siden findes ikke</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Linket du har fulgt er udløbet eller ugyldigt.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" data-testid="public-events-page">
      <header className="border-b border-border bg-white">
        <div className="max-w-4xl mx-auto px-6 py-6 flex items-center gap-3">
          <img src={LOGO_URL} alt="Nyreforeningen" className="w-10 h-10 object-contain" />
          <div>
            <h1 className="font-bold text-xl tracking-tight">Kommende arrangementer</h1>
            <p className="text-xs text-muted-foreground">Nyreforeningen Hovedstaden</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {events.length === 0 ? (
          <div className="border border-dashed border-border rounded-md bg-white p-12 text-center">
            <p className="text-sm text-muted-foreground">
              Der er ingen kommende arrangementer i øjeblikket. Kig forbi senere.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {events.map((ev) => (
              <PublicEventCard key={ev.id} ev={ev} />
            ))}
          </div>
        )}
      </main>

      <footer className="max-w-4xl mx-auto px-6 py-8 text-center text-xs text-muted-foreground">
        Følg vores Facebook-gruppe for tilmelding og opdateringer.
      </footer>
    </div>
  );
}

function PublicEventCard({ ev }) {
  const where = [ev.location, ev.address].filter(Boolean);
  const mapsHref = ev.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.address)}`
    : null;
  return (
    <article
      className="border border-border rounded-md bg-white overflow-hidden shadow-sm"
      data-testid={`public-event-${ev.id}`}
    >
      {ev.image_url && (
        <img
          src={ev.image_url}
          alt={ev.title}
          className="w-full h-48 sm:h-64 object-cover"
          loading="lazy"
        />
      )}
      <div className="p-5 sm:p-7">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          {ev.title}
        </h2>

        <dl className="mt-4 grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          {ev.event_date && (
            <>
              <dt className="font-medium text-muted-foreground">Dato:</dt>
              <dd className="text-foreground">{fmtDateDk(ev.event_date, ev.event_time)}</dd>
            </>
          )}
          {ev.location && (
            <>
              <dt className="font-medium text-muted-foreground">Mødested:</dt>
              <dd className="text-foreground">{ev.location}</dd>
            </>
          )}
          {ev.address && (
            <>
              <dt className="font-medium text-muted-foreground">Adresse:</dt>
              <dd>
                {mapsHref ? (
                  <a
                    href={mapsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                    data-testid={`public-event-maps-${ev.id}`}
                  >
                    {ev.address}
                  </a>
                ) : (
                  ev.address
                )}
              </dd>
            </>
          )}
          {ev.registration_deadline && (
            <>
              <dt className="font-medium text-muted-foreground">Tilmeldingsfrist:</dt>
              <dd className="text-foreground">{fmtDeadlineDk(ev.registration_deadline)}</dd>
            </>
          )}
          {ev.contact_name && (
            <>
              <dt className="font-medium text-muted-foreground">Tilmelding til:</dt>
              <dd className="text-foreground">
                <div>{ev.contact_name}</div>
                {ev.contact_email && (
                  <a href={`mailto:${ev.contact_email}`} className="text-primary hover:underline">
                    {ev.contact_email}
                  </a>
                )}
                {ev.contact_email && ev.contact_phone && <span className="text-muted-foreground"> · </span>}
                {ev.contact_phone && (
                  <a href={`tel:${ev.contact_phone}`} className="text-primary hover:underline">
                    {ev.contact_phone}
                  </a>
                )}
              </dd>
            </>
          )}
          <dt className="font-medium text-muted-foreground">Pris:</dt>
          <dd className="text-foreground">{fmtPrice(ev.price_member, ev.price_non_member)}</dd>
        </dl>

        {ev.description && (
          <div className="mt-5 pt-5 border-t border-border">
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">
              {ev.description}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}
