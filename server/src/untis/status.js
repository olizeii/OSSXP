/**
 * Live-Status „Wo ist X gerade?“ und abgeleitete Vertretungen
 * (aus UntisDashboard/status.ts und derive.ts). Wird im Browser für den Sekunden-Countdown gespiegelt.
 */

const ids = (refs) =>
  refs
    .map((r) => r.id)
    .sort((a, b) => a - b)
    .join(',');

/** true, wenn `b` direkt an `a` anschließt (Doppelstunde: gleiche Klasse/Fach/Lehrkraft/Raum, ≤ 15 min Pause). */
export function continuesBlock(a, b) {
  return (
    b.startMin >= a.endMin &&
    b.startMin - a.endMin <= 15 &&
    ids(a.subjects) === ids(b.subjects) &&
    ids(a.classes) === ids(b.classes) &&
    ids(a.teachers) === ids(b.teachers) &&
    ids(a.rooms) === ids(b.rooms)
  );
}

/**
 * @returns {{ state: 'in-lesson'|'break'|'free'|'before-school'|'after-school'|'no-lessons',
 *            current, currentBlockEnd, next, previous }}
 */
export function computeStatus(lessons, atMin) {
  const active = lessons.filter((l) => l.status !== 'cancelled').sort((a, b) => a.startMin - b.startMin);
  const current = active.find((l) => l.startMin <= atMin && atMin < l.endMin) ?? null;
  const next = active.find((l) => l.startMin > atMin) ?? null;
  const previous = [...active].reverse().find((l) => l.endMin <= atMin) ?? null;

  let currentBlockEnd = null;
  if (current) {
    let last = current;
    for (const l of active) if (continuesBlock(last, l)) last = l;
    currentBlockEnd = last.endMin;
  }

  let state;
  if (active.length === 0) state = 'no-lessons';
  else if (current) state = 'in-lesson';
  else if (!previous) state = 'before-school';
  else if (!next) state = 'after-school';
  else state = next.startMin - previous.endMin <= 20 ? 'break' : 'free';

  return { state, current, currentBlockEnd, next, previous };
}

function lessonChangeType(lesson) {
  if (lesson.status === 'cancelled') return 'cancel';
  if (lesson.teacherChanged) return 'subst';
  if (lesson.roomChanged) return 'rmchg';
  if (lesson.status === 'irregular') return lesson.lessonType === 'ex' ? 'exam' : 'add';
  return null;
}

/** Baut eine Vertretungsliste aus Stundenplänen (wenn getSubstitutions nicht erlaubt ist, und im Demo-Modus). */
export function deriveSubstitutions(lessons) {
  const result = [];
  for (const lesson of lessons) {
    const type = lessonChangeType(lesson);
    if (!type) continue;
    result.push({
      id: `${lesson.id}-${lesson.date}-${lesson.startMin}-${type}`,
      type,
      date: lesson.date,
      start: lesson.start,
      end: lesson.end,
      startMin: lesson.startMin,
      endMin: lesson.endMin,
      classes: lesson.classes,
      teachers: lesson.teachers,
      subjects: lesson.subjects,
      rooms: lesson.rooms,
      text: lesson.substText ?? lesson.text,
    });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
}
