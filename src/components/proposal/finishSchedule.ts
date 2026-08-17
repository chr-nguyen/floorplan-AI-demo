import type { Language } from '../i18n';

export type FinishScheduleField = 'room' | 'floor' | 'baseboard' | 'dado' | 'wall' | 'ceiling' | 'remarks';

export interface LocalizedScheduleText {
  ja: string;
  en: string;
}

export interface FinishScheduleRow {
  id: string;
  room: LocalizedScheduleText;
  floor: LocalizedScheduleText;
  baseboard: LocalizedScheduleText;
  dado: LocalizedScheduleText;
  wall: LocalizedScheduleText;
  ceiling: LocalizedScheduleText;
  remarks: LocalizedScheduleText;
}

const text = (ja: string, en: string): LocalizedScheduleText => ({ ja, en });

export const DEFAULT_FINISH_SCHEDULE: FinishScheduleRow[] = [
  {
    id: 'kitchen',
    room: text('キッチン', 'Kitchen'),
    floor: text('', ''), baseboard: text('', ''), dado: text('', ''), wall: text('', ''), ceiling: text('', ''), remarks: text('', ''),
  },
  {
    id: 'living',
    room: text('リビング', 'Living room'),
    floor: text('', ''), baseboard: text('', ''), dado: text('', ''), wall: text('', ''), ceiling: text('', ''), remarks: text('', ''),
  },
  {
    id: 'dining',
    room: text('ダイニング', 'Dining room'),
    floor: text('', ''), baseboard: text('', ''), dado: text('', ''), wall: text('', ''), ceiling: text('', ''), remarks: text('', ''),
  },
  {
    id: 'bathroom',
    room: text('浴室', 'Bathroom'),
    floor: text('', ''), baseboard: text('', ''), dado: text('', ''), wall: text('', ''), ceiling: text('', ''), remarks: text('', ''),
  },
  {
    id: 'bedroom',
    room: text('寝室', 'Bedroom'),
    floor: text('', ''), baseboard: text('', ''), dado: text('', ''), wall: text('', ''), ceiling: text('', ''), remarks: text('', ''),
  },
];

export const scheduleText = (value: LocalizedScheduleText, language: Language) => value[language];

export const cloneFinishSchedule = () => DEFAULT_FINISH_SCHEDULE.map((row) => ({
  ...row,
  room: { ...row.room },
  floor: { ...row.floor },
  baseboard: { ...row.baseboard },
  dado: { ...row.dado },
  wall: { ...row.wall },
  ceiling: { ...row.ceiling },
  remarks: { ...row.remarks },
}));

export const blankFinishScheduleRow = (id: string, ja = '追加室', en = 'Additional room'): FinishScheduleRow => ({
  id,
  room: text(ja, en),
  floor: text('', ''),
  baseboard: text('', ''),
  dado: text('', ''),
  wall: text('', ''),
  ceiling: text('', ''),
  remarks: text('', ''),
});
