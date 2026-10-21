/**
 * Demo-Datenquelle (UNTIS_MOCK=true) – wie der Mock-Modus in UntisDashboard.
 * Erzeugt einen deterministischen Wochenplan, damit man UntisXP ohne echten Account testen kann.
 */

const PERIODS = [
  ['1', '07:45', '08:30'], ['2', '08:30', '09:15'], ['3', '09:35', '10:20'], ['4', '10:20', '11:05'],
  ['5', '11:25', '12:10'], ['6', '12:10', '12:55'], ['7', '13:40', '14:25'], ['8', '14:25', '15:10'],
];

const SUBJECTS = [
  { name: 'M', longName: 'Mathematik', teacher: 'MÜL', room: 'A104' },
  { name: 'D', longName: 'Deutsch', teacher: 'SCH', room: 'A201' },
  { name: 'E', longName: 'Englisch', teacher: 'WEB', room: 'B012' },
  { name: 'INF', longName: 'Informatik', teacher: 'KRA', room: 'PC2' },
  { name: 'PH', longName: 'Physik', teacher: 'HOF', room: 'NW1' },
  { name: 'GE', longName: 'Geschichte', teacher: 'BEC', room: 'A203' },
  { name: 'SP', longName: 'Sport', teacher: 'KOC', room: 'TH1' },
  { name: 'BIO', longName: 'Biologie', teacher: 'RIC', room: 'NW3' },
];

/** Kleiner deterministischer Zufallsgenerator (gleiche Woche → gleicher Plan). */
function seeded(seed) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

export const mockSource = {
  mode: 'demo',

  async verify() {
    return { personType: 5 };
  },

  async getTimegrid(_link) {
    const units = PERIODS.map(([name, start, end]) => ({ name, start, end, startMin: toMin(start), endMin: toMin(end) }));
    return Object.fromEntries([1, 2, 3, 4, 5].map((day) => [day, units]));
  },

  async getTimetable(_link, from, to) {
    const lessons = [];
    for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
      const weekday = d.getUTCDay();
      if (weekday === 0 || weekday === 6) continue;

      const date = d.toISOString().slice(0, 10);
      const rand = seeded(Number(date.replaceAll('-', '')));
      const count = 5 + Math.floor(rand() * 3); // 5–7 Stunden

      for (let p = 0; p < count; p++) {
        const subject = SUBJECTS[Math.floor(rand() * SUBJECTS.length)];
        const [, start, end] = PERIODS[p];
        const roll = rand();
        const status = roll < 0.07 ? 'cancelled' : roll < 0.14 ? 'irregular' : 'regular';
        lessons.push({
          id: `${date}-${p}`,
          date,
          start,
          end,
          startMin: toMin(start),
          endMin: toMin(end),
          subjects: [{ name: subject.name, longName: subject.longName }],
          teachers: [{ name: status === 'irregular' ? 'VER' : subject.teacher, longName: '', original: status === 'irregular' ? { name: subject.teacher } : undefined }],
          rooms: [{ name: subject.room, longName: '' }],
          classes: [{ name: '10b', longName: 'Klasse 10b' }],
          status,
          info: status === 'cancelled' ? 'Entfall wegen Fortbildung' : status === 'irregular' ? 'Vertretung' : '',
          substText: '',
          text: '',
        });
      }
    }
    return lessons;
  },
};
