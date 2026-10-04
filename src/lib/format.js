export function formatEventDate(dateStr, time) {
  if (!dateStr) return '';
  const date = new Date(`${dateStr}T00:00:00`);
  const day = date.toLocaleDateString('en-ZM', { weekday: 'short', day: 'numeric', month: 'short' });
  return time ? `${day} · ${time}` : day;
}

// A date in Zambia as YYYY-MM-DD, the way event dates are stored, so "today"
// does not depend on the phone's own time zone. `offsetDays` moves it.
export function zambiaDateString(offsetDays = 0, now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lusaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now + offsetDays * 24 * 60 * 60 * 1000));
}
