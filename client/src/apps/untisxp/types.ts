/** Datentypen von UntisXP – entsprechen den Antworten von /api/untis/* (aus UntisDashboard/types.ts). */

export type ElementType = 'teacher' | 'class' | 'room' | 'subject';

export interface UntisElement {
  id: number;
  type: ElementType;
  name: string;
  longName?: string;
  building?: string;
}

export interface ElementRef {
  id: number;
  name: string;
  longName?: string;
  /** Ursprünglich geplantes Element bei Vertretung/Raumänderung */
  original?: { id?: number; name: string };
}

export type LessonStatus = 'regular' | 'cancelled' | 'irregular';

export interface Lesson {
  id: number;
  date: string;
  start: string;
  end: string;
  startMin: number;
  endMin: number;
  classes: ElementRef[];
  teachers: ElementRef[];
  subjects: ElementRef[];
  rooms: ElementRef[];
  status: LessonStatus;
  lessonType?: string;
  text?: string;
  substText?: string;
  info?: string;
  teacherChanged: boolean;
  roomChanged: boolean;
}

export type SubstitutionType = 'cancel' | 'subst' | 'add' | 'shift' | 'rmchg' | 'rmlk' | 'bs' | 'free' | 'exam' | 'other';

export interface Substitution {
  id: string;
  type: SubstitutionType;
  date: string;
  start: string;
  end: string;
  startMin: number;
  endMin: number;
  classes: ElementRef[];
  teachers: ElementRef[];
  subjects: ElementRef[];
  rooms: ElementRef[];
  text?: string;
}

export interface TimeUnit {
  name: string;
  start: string;
  end: string;
  startMin: number;
  endMin: number;
}

/** ISO-Wochentag (1 = Montag) → Zeitraster */
export type Timegrid = Record<string, TimeUnit[]>;

export interface MasterData {
  teachers: UntisElement[];
  classes: UntisElement[];
  rooms: UntisElement[];
  subjects: UntisElement[];
  timegrid: Timegrid;
  teacherSource: 'api' | 'derived';
  mode: 'live' | 'demo';
  timezone: string;
}

export type ElementState = 'in-lesson' | 'break' | 'free' | 'before-school' | 'after-school' | 'no-lessons';

export interface ElementStatus {
  element: UntisElement;
  date: string;
  atMin: number;
  live: boolean;
  state: ElementState;
  current: Lesson | null;
  currentBlockEnd: number | null;
  next: Lesson | null;
  previous: Lesson | null;
  lessons: Lesson[];
  timegrid: TimeUnit[];
}

export interface RoomAvailability {
  room: UntisElement;
  occupiedBy: Lesson | null;
  freeUntilMin: number | null;
  busyUntilMin: number | null;
}

export interface FreeRoomsResult {
  date: string;
  atMin: number;
  live: boolean;
  free: RoomAvailability[];
  occupied: RoomAvailability[];
}

export interface SubstitutionResult {
  from: string;
  to: string;
  items: Substitution[];
  source: 'api' | 'derived';
}

export interface PeriodUtilization {
  name: string;
  start: string;
  end: string;
  startMin: number;
  endMin: number;
  occupiedRooms: number;
  totalRooms: number;
  lessons: number;
}

export interface DashboardStats {
  date: string;
  atMin: number;
  live: boolean;
  lessonsToday: number;
  cancellations: number;
  substitutions: number;
  roomChanges: number;
  additional: number;
  roomsTotal: number;
  roomsOccupiedNow: number;
  teachersInLessonNow: number;
  teachersTotal: number;
  classesInLessonNow: number;
  classesTotal: number;
  utilization: PeriodUtilization[];
  upcomingChanges: Substitution[];
  substitutionSource: 'api' | 'derived';
}

/** Ansichten von UntisXP (wie die Seiten von UntisDashboard). */
export type View = 'dashboard' | 'week' | 'teacher' | 'class' | 'room' | 'free' | 'subst';

export interface Route {
  view: View;
  /** Ausgewähltes Element bei teacher/class/room */
  id?: number;
}

/** Gewählter Zeitpunkt: null = heute bzw. „jetzt“ (live). */
export interface MomentChoice {
  date: string | null;
  time: string | null;
}
