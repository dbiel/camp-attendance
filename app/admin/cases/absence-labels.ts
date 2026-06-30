/** Shared date labels for office-marked absences (form hint + the board list). */

export function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Range label: "Today" for a single day, "Today → Wed Jul 2" across days. */
export function rangeLabel(date: string, endDate: string | undefined, today: string): string {
  const start = dayLabel(date, today);
  if (!endDate || endDate === date) return start;
  return `${start} → ${dayLabel(endDate, today)}`;
}
