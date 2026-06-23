import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { Users, Calendar, UserCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

function StatTile({ label, value, icon: Icon, testid }) {
  return (
    <div
      className="bg-white border border-border rounded-md p-6 flex items-start justify-between"
      data-testid={testid}
    >
      <div>
        <div className="label-tiny">{label}</div>
        <div className="mt-3 text-3xl font-bold tracking-tight text-foreground">{value}</div>
      </div>
      <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">
        <Icon className="w-5 h-5" strokeWidth={1.5} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ members: 0, events: 0, participants: 0 });
  const [events, setEvents] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [s, e] = await Promise.all([api.get("/stats"), api.get("/events")]);
        setStats(s.data);
        setEvents(e.data);
      } catch (err) {
        toast.error(formatApiError(err));
      }
    })();
  }, []);

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto" data-testid="dashboard-page">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Oversigt</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Velkommen, {user?.name || user?.email}
          </p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatTile label="Medlemmer" value={stats.members} icon={Users} testid="stat-members" />
        <StatTile label="Arrangementer" value={stats.events} icon={Calendar} testid="stat-events" />
        <StatTile label="Tilmeldinger" value={stats.participants} icon={UserCheck} testid="stat-participants" />
      </div>

      <section className="mt-12">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Seneste arrangementer</h2>
          <Link
            to="/arrangementer"
            className="text-sm text-primary hover:underline"
            data-testid="go-to-events-link"
          >
            Se alle →
          </Link>
        </div>

        <div className="mt-4 border border-border rounded-md bg-white divide-y divide-border">
          {events.length === 0 && (
            <div className="p-8 text-sm text-muted-foreground text-center">
              Ingen arrangementer endnu.
            </div>
          )}
          {events.slice(0, 5).map((ev) => (
            <Link
              key={ev.id}
              to={`/arrangementer/${ev.id}`}
              data-testid={`dashboard-event-${ev.id}`}
              className="block p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-foreground">{ev.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {ev.event_date ? new Date(ev.event_date).toLocaleDateString("da-DK") : "Ingen dato"}
                    {ev.event_time ? ` kl. ${ev.event_time}` : ""}
                    {ev.location ? ` · ${ev.location}` : ""}
                  </div>
                </div>
                <div className="text-sm">
                  <span className="font-medium text-primary">{ev.participant_count}</span>
                  <span className="text-muted-foreground"> tilmeldte</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
