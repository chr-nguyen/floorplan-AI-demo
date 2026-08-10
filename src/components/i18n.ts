export type Language = 'ja' | 'en';

export const pick = (language: Language, japanese: string, english: string) =>
  language === 'ja' ? japanese : english;

