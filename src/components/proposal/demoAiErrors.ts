import type { Language } from '../i18n';

type AiStep = 'floorplan' | 'preview' | 'estimate';

const copy = (language: Language, ja: string, en: string) => language === 'ja' ? ja : en;

export const demoAiErrorMessage = (error: unknown, language: Language, step: AiStep) => {
  const detail = error instanceof Error ? error.message : String(error || '');
  if (/429|quota|resource.?exhausted|credit|rate.?limit/i.test(detail)) {
    return copy(language, 'AIデモの利用枠が一時的に混み合っています。現在の作業は保存されています。時間をおいて一度だけお試しください。', 'The AI demo is temporarily at its usage limit. Your work is safe; try once later.');
  }
  if (/timeout|timed out|abort/i.test(detail)) {
    return copy(language, 'AIの応答に時間がかかりすぎました。自動再試行はしていません。現在の作業はそのままです。', 'The AI took too long. It was not retried automatically, and your current work is unchanged.');
  }
  if (/api.?key|not configured|unauthorized|permission|\b401\b|\b403\b/i.test(detail)) {
    return copy(language, 'デモ用AIサービスは現在利用できません。既存の平面図・写真・仕上げ選択は引き続き使用できます。', 'The demo AI service is unavailable right now. Existing floorplans, photos, and finish selections still work.');
  }
  if (step === 'floorplan') {
    return copy(language, '平面図の解析を完了できませんでした。部屋タブからデモを続けるか、必要なときに一度だけ再実行してください。', 'Floorplan analysis did not complete. Continue from the room tabs, or run it once more when needed.');
  }
  if (step === 'estimate') {
    return copy(language, '面積候補を作成できませんでした。既定数量を使ってデモを続けられます。', 'The area suggestion was unavailable. You can continue the demo with the default quantities.');
  }
  return copy(language, 'プレビューを作成できませんでした。選択内容と元写真は保持されています。必要なときに一度だけ再実行してください。', 'The preview was not created. Your selections and source photo are preserved; run it once more only when needed.');
};
