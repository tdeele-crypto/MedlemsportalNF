import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Mail, Newspaper, Calendar, MapPin, Check, Banknote, UserCheck } from "lucide-react";
import { toast } from "sonner";

const fmtDk = (date, time) => {
  if (!date) return "";
  try {
    const d = new Date(date);
    const days = ["søndag","mandag","tirsdag","onsdag","torsdag","fredag","lørdag"];
    const months = ["januar","februar","marts","april","maj","juni","juli","august","september","oktober","november","december"];
    let s = `${days[d.getDay()]} d. ${d.getDate()}. ${months[d.getMonth()]} ${d.getFullYear()}`;
    if (time) s += ` kl. ${time}`;
    return s;
  } catch { return date; }
};

export default function MemberDetailPage() {
  const { id } = useParams();
  const [member, setMember] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, regs] = await Promise.all([
        api.get(`/members/${id}`),
        api.get(`/members/${id}/registrations`),
      ]);
      setMember(m.data);
      setRegistrations(regs.data);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="p-10 text-sm text-muted-foreground" data-testid="member-detail-loading">Indlæser medlem...</div>;
  }
  if (!member) {
    return <div className="p-10 text-sm text-muted-foreground">Medlem ikke fundet.</div>;
  }

  const totalEvents = registrations.length;
  const totalAttended = registrations.filter((r) => r.checked_in).length;
  const totalPaid = registrations.filter((r) => r.paid).length;

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto" data-testid="member-detail-page">
      <Link
        to="/medlemmer"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        data-testid="back-to-members"
      >
        <ArrowLeft className="w-4 h-4 mr-1" strokeWidth={1.6} />
        Tilbage til medlemmer
      </Link>

      <div className="mt-4 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-mono text-muted-foreground tracking-wider" data-testid="member-number">
            #{member.medlemsnummer}
          </div>
          <h1 className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight" data-testid="member-name">
            {member.navn}
          </h1>
          {member.adresse && (
            <p className="mt-2 text-sm text-muted-foreground whitespace-pre-line" data-testid="member-address">
              {member.adresse}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {member.email && (
              <a href={`mailto:${member.email}`} className="text-primary hover:underline" data-testid="member-email">
                {member.email}
              </a>
            )}
            {member.telefon && (
              <a href={`tel:${member.telefon}`} className="text-primary hover:underline" data-testid="member-phone">
                {member.telefon}
              </a>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {member.medlemstype && (
              <Badge variant="outline" className="text-xs font-normal border-primary/30 text-primary" data-testid="member-type">
                {member.medlemstype}
              </Badge>
            )}
            {member.bladstatus && (
              <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid="member-blad-status">
                {member.bladstatus.includes("e-mail") ? (
                  <Mail className="w-3 h-3" strokeWidth={1.6} />
                ) : (
                  <Newspaper className="w-3 h-3" strokeWidth={1.6} />
                )}
                {member.bladstatus}
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:gap-4 shrink-0">
          <Stat label="Tilmeldinger" value={totalEvents} icon={Calendar} testId="stat-total" />
          <Stat label="Mødt op" value={totalAttended} icon={UserCheck} testId="stat-attended" />
          <Stat label="Betalt" value={totalPaid} icon={Banknote} testId="stat-paid" />
        </div>
      </div>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">Tilmeldingshistorik</h2>
      <div className="mt-4 border border-border rounded-md bg-white overflow-hidden" data-testid="registrations-list">
        {registrations.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Ingen tilmeldinger endnu.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {registrations.map((r) => {
              const total = (r.num_members || 0) + (r.num_non_members || 0);
              const isDeleted = !r.event_id;
              const row = (
                <div
                  key={r.participant_id}
                  data-testid={`registration-row-${r.participant_id}`}
                  className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-muted/30"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground">{r.event_title}</div>
                    <div className="mt-1 text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
                      {r.event_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" strokeWidth={1.6} />
                          {fmtDk(r.event_date, r.event_time)}
                        </span>
                      )}
                      {(r.location || r.address) && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" strokeWidth={1.6} />
                          {[r.location, r.address].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </div>
                    {r.note && (
                      <div className="mt-1 text-xs text-muted-foreground italic whitespace-pre-line">
                        {r.note}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 text-xs shrink-0">
                    <span
                      className="px-2 py-1 rounded-md bg-muted text-foreground/70 font-medium whitespace-nowrap"
                      data-testid={`reg-count-${r.participant_id}`}
                    >
                      {total} deltager{total === 1 ? "" : "e"}
                    </span>
                    <StatusPill on={r.paid} label="Betalt" testId={`reg-paid-${r.participant_id}`} />
                    <StatusPill on={r.checked_in} label="Mødt op" testId={`reg-checked-${r.participant_id}`} />
                  </div>
                </div>
              );
              return (
                <li key={r.participant_id}>
                  {isDeleted ? row : (
                    <Link to={`/arrangementer/${r.event_id}`} className="block">
                      {row}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon, testId }) {
  return (
    <div className="border border-border rounded-md p-3 bg-white text-center">
      <Icon className="w-4 h-4 mx-auto text-muted-foreground mb-1" strokeWidth={1.5} />
      <div className="text-2xl font-bold text-primary leading-none" data-testid={testId}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function StatusPill({ on, label, testId }) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md whitespace-nowrap ${
        on ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground/60"
      }`}
    >
      {on && <Check className="w-3 h-3" strokeWidth={2} />}
      {label}
    </span>
  );
}
