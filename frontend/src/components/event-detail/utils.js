export const fmtKr = (n) => `${Math.round((Number(n) || 0) * 100) / 100} kr.`;

export const fmtDateDk = (date, time) => {
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

export const buildFacebookPostText = (event) => {
  if (!event) return "";
  const lines = [];
  lines.push(`📅 ${event.title}`);
  lines.push("");
  if (event.event_date) lines.push(fmtDateDk(event.event_date, event.event_time));
  if (event.registration_deadline) {
    lines.push(`⏳ Senest tilmelding: ${fmtDateDk(event.registration_deadline, null)}`);
  }
  const where = [event.location, event.address].filter(Boolean).join(" · ");
  if (where) lines.push(`📍 ${where}`);
  if (event.description) {
    lines.push("");
    lines.push(event.description);
  }
  if ((event.price_member ?? 0) > 0 || (event.price_non_member ?? 0) > 0) {
    lines.push("");
    lines.push(`💰 Pris: ${event.price_member} kr. for medlemmer / ${event.price_non_member} kr. for ikke-medlemmer`);
  }
  if (event.contact_name) {
    lines.push("");
    const cParts = [`Tilmelding til ${event.contact_name}`];
    if (event.contact_email) cParts.push(event.contact_email);
    if (event.contact_phone) cParts.push(`tlf. ${event.contact_phone}`);
    lines.push(cParts.join(" · "));
  }
  return lines.join("\n");
};
