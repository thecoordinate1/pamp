export function formatEventDate(dateStr, time) {
  if (!dateStr) return '';
  const date = new Date(`${dateStr}T00:00:00`);
  const day = date.toLocaleDateString('en-ZM', { weekday: 'short', day: 'numeric', month: 'short' });
  return time ? `${day} · ${time}` : day;
}
