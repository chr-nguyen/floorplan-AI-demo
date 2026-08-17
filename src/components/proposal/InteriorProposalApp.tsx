import React, { useMemo, useRef, useState } from 'react';
import { pick, type Language } from '../i18n';
import {
  CATALOG,
  DEFAULT_QUANTITIES,
  DEFAULT_SELECTIONS,
  SLOT_DEFINITIONS,
  itemColor,
  itemManufacturer,
  itemName,
  itemSource,
  itemSpecification,
  itemUnit,
  statusLabel,
  type CatalogItem,
  type SelectionSlot,
} from './catalog';
import { blankFinishScheduleRow, cloneFinishSchedule, scheduleText, type FinishScheduleField } from './finishSchedule';
import { downscaleImage, readJsonResponse } from './downscaleImage';
import '../../styles/archix.css';
import './InteriorProposalApp.css';

interface RoomTab {
  id: string;
  type: 'kitchen' | 'living' | 'dining' | 'bathroom' | 'bedroom' | 'custom';
  ja: string;
  en: string;
  custom?: boolean;
}

const DEFAULT_ROOM_TABS: RoomTab[] = [
  { id: 'kitchen', type: 'kitchen', ja: 'キッチン', en: 'Kitchen' },
  { id: 'living', type: 'living', ja: 'リビング', en: 'Living room' },
  { id: 'dining', type: 'dining', ja: 'ダイニング', en: 'Dining room' },
  { id: 'bathroom', type: 'bathroom', ja: '浴室', en: 'Bathroom' },
  { id: 'bedroom', type: 'bedroom', ja: '寝室', en: 'Bedroom' },
];

const STYLE_OPTIONS = [
  { id: 'japandi', ja: 'ジャパンディ', en: 'Japandi' },
  { id: 'natural', ja: 'ナチュラルモダン', en: 'Natural modern' },
  { id: 'minimal', ja: 'ミニマル', en: 'Minimal' },
  { id: 'hotel', ja: 'ホテルライク', en: 'Hotel-inspired' },
  { id: 'scandinavian', ja: '北欧', en: 'Scandinavian' },
];

const SECTION_LABELS = {
  finish: { ja: '仕上材', en: 'Finishes' },
  fixture: { ja: '設備・器具', en: 'Fixtures' },
  accessory: { ja: '家具・アクセサリー', en: 'Furniture & accessories' },
};

const FINISH_SCHEDULE_COLUMNS: Array<{ field: FinishScheduleField; ja: string; en: string }> = [
  { field: 'room', ja: '室名', en: 'Room' },
  { field: 'floor', ja: '床', en: 'Floor' },
  { field: 'baseboard', ja: '巾木', en: 'Baseboard' },
  { field: 'dado', ja: '腰', en: 'Dado / Wainscot' },
  { field: 'wall', ja: '壁', en: 'Wall' },
  { field: 'ceiling', ja: '天井', en: 'Ceiling' },
  { field: 'remarks', ja: '備考', en: 'Remarks' },
];

const DEFAULT_SLOT_QUANTITY: Record<SelectionSlot, number> = {
  floor: 42, walls: 118, ceiling: 42, counter: 1, cabinet: 1, backsplash: 1, faucet: 1, sink: 1, hardware: 12, lighting: 3,
};

const activeSlotsForRoom = (roomType: RoomTab['type']): SelectionSlot[] => {
  const coreSlots: SelectionSlot[] = ['floor', 'walls', 'ceiling', 'lighting'];
  const kitchenSlots: SelectionSlot[] = ['counter', 'cabinet', 'backsplash', 'faucet', 'sink', 'hardware'];
  const washroomSlots: SelectionSlot[] = ['counter', 'cabinet', 'faucet', 'sink', 'hardware'];
  if (roomType === 'kitchen') return [...coreSlots, ...kitchenSlots];
  if (roomType === 'bathroom') return [...coreSlots, ...washroomSlots];
  return coreSlots;
};

interface SurfaceEstimate {
  floorAreaM2: number;
  netWallAreaM2: number;
  ceilingAreaM2: number;
  roomWidthM: number;
  roomDepthM: number;
  ceilingHeightM: number;
  confidence: 'low' | 'medium' | 'high';
  assumptionJa: string;
  assumptionEn: string;
}

interface RoomDraft {
  style: string;
  requestNote: string;
  sourcePhotoUrl?: string;
  sourcePhotoData?: string;
  sourcePhotoName?: string;
  selections: Record<SelectionSlot, string>;
  enabledSlots: SelectionSlot[];
  accessories: string[];
  quantities: Record<string, number>;
  previewUrl?: string;
  previewStale: boolean;
  assumedCeilingHeight: number;
  surfaceEstimate?: SurfaceEstimate;
  renderedAt?: string;
}

const createRoomDraft = (): RoomDraft => ({
  style: 'japandi',
  requestNote: '明るく落ち着いた空間。生活感を抑え、家族が過ごしやすいレイアウト。',
  selections: { ...DEFAULT_SELECTIONS },
  enabledSlots: ['floor', 'walls', 'ceiling'],
  accessories: [],
  quantities: { ...DEFAULT_QUANTITIES },
  previewStale: false,
  assumedCeilingHeight: 2.4,
});

const createInitialRoomDrafts = () => Object.fromEntries(DEFAULT_ROOM_TABS.map((room) => [room.id, createRoomDraft()]));

const surfaceQuantity = (estimate: SurfaceEstimate | undefined, slot: SelectionSlot) => {
  if (!estimate) return undefined;
  if (slot === 'floor') return estimate.floorAreaM2;
  if (slot === 'walls') return estimate.netWallAreaM2;
  if (slot === 'ceiling') return estimate.ceilingAreaM2;
  return undefined;
};

const currency = (value: number, language: Language) => new Intl.NumberFormat(language === 'ja' ? 'ja-JP' : 'en-US', {
  style: 'currency', currency: 'JPY', maximumFractionDigits: 0,
}).format(value);

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char] || char));

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

export default function InteriorProposalApp() {
  const [language, setLanguage] = useState<Language>('ja');
  const [projectName, setProjectName] = useState('朝日様邸 内装計画');
  const [customerName, setCustomerName] = useState('朝日建設株式会社');
  const [roomTabs, setRoomTabs] = useState<RoomTab[]>(DEFAULT_ROOM_TABS);
  const [activeRoomId, setActiveRoomId] = useState(DEFAULT_ROOM_TABS[0].id);
  const [roomDrafts, setRoomDrafts] = useState<Record<string, RoomDraft>>(createInitialRoomDrafts);
  const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({});
  const [viewMode, setViewMode] = useState<'source' | 'preview'>('source');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string>();
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState<string>();
  const [finishScheduleRows, setFinishScheduleRows] = useState(cloneFinishSchedule);
  const [scheduleView, setScheduleView] = useState<'finishes' | 'estimate'>('finishes');
  const [scheduleExpanded, setScheduleExpanded] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = (ja: string, en: string) => pick(language, ja, en);
  const room = roomTabs.find((candidate) => candidate.id === activeRoomId) || roomTabs[0];
  const roomType = room.type;
  const activeDraft = roomDrafts[activeRoomId] || createRoomDraft();
  const { style, requestNote, sourcePhotoUrl, sourcePhotoData, sourcePhotoName, selections, enabledSlots, accessories, quantities, previewUrl, previewStale, assumedCeilingHeight, surfaceEstimate } = activeDraft;
  const updateActiveDraft = (update: Partial<RoomDraft> | ((current: RoomDraft) => Partial<RoomDraft>)) => {
    setRoomDrafts((current) => {
      const draft = current[activeRoomId] || createRoomDraft();
      const patch = typeof update === 'function' ? update(draft) : update;
      return { ...current, [activeRoomId]: { ...draft, ...patch } };
    });
  };
  const designStyle = STYLE_OPTIONS.find((candidate) => candidate.id === style) || STYLE_OPTIONS[0];
  const activeSlotDefinitions = useMemo(() => {
    const activeSlots = activeSlotsForRoom(roomType);
    return SLOT_DEFINITIONS.filter((slot) => activeSlots.includes(slot.id));
  }, [roomType]);

  const selectedItems = useMemo(() => {
    const ids = [
      ...activeSlotDefinitions.filter((slot) => enabledSlots.includes(slot.id)).map((slot) => selections[slot.id]),
      ...accessories,
    ];
    return ids.map((id) => CATALOG.find((item) => item.id === id)).filter(Boolean) as CatalogItem[];
  }, [activeSlotDefinitions, enabledSlots, selections, accessories]);

  const getQuantity = (item: CatalogItem) => quantities[item.id] ?? (item.slot ? DEFAULT_SLOT_QUANTITY[item.slot] : 1);
  const getUnitPrice = (item: CatalogItem) => priceOverrides[item.id] ?? item.unitPrice;
  const subtotal = selectedItems.reduce((sum, item) => {
    const price = getUnitPrice(item);
    return sum + (price === undefined ? 0 : getQuantity(item) * price);
  }, 0);
  const unpricedCount = selectedItems.filter((item) => getUnitPrice(item) === undefined).length;
  const tax = Math.round(subtotal * 0.1);
  const total = subtotal + tax;
  const activeScheduleRoomId = activeRoomId;
  const renderedRoomCount = roomTabs.filter((candidate) => roomDrafts[candidate.id]?.previewUrl && !roomDrafts[candidate.id]?.previewStale).length;
  const activeScheduleRow = finishScheduleRows.find((row) => row.id === activeScheduleRoomId);
  const activeRoomRendered = Boolean(previewUrl && !previewStale);

  const estimateRoomSurfaces = async (imageData: string, targetRoomId: string, targetRoomName: string, ceilingHeight: number) => {
    setEstimateLoading(true);
    setEstimateError(undefined);
    try {
      const response = await fetch('/api/estimate-room-surfaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePhoto: imageData,
          room: targetRoomName,
          assumedCeilingHeight: ceilingHeight,
        }),
      });
      const payload = await readJsonResponse(response);
      if (!response.ok || !payload.estimate) throw new Error(payload.error || 'Surface estimation failed');
      const estimate = payload.estimate as SurfaceEstimate;
      setRoomDrafts((current) => {
        const draft = current[targetRoomId];
        if (!draft) return current;
        return {
          ...current,
          [targetRoomId]: {
            ...draft,
            surfaceEstimate: estimate,
            quantities: {
              ...draft.quantities,
              [draft.selections.floor]: estimate.floorAreaM2,
              [draft.selections.walls]: estimate.netWallAreaM2,
              [draft.selections.ceiling]: estimate.ceilingAreaM2,
            },
          },
        };
      });
    } catch (error) {
      setEstimateError(error instanceof Error ? error.message : t('面積の推定に失敗しました。', 'Surface estimation failed.'));
    } finally {
      setEstimateLoading(false);
    }
  };

  const loadSourcePhoto = (file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setPreviewError(t('PNG または JPEG の室内写真を選択してください。', 'Choose a PNG or JPEG room photo.'));
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setPreviewError(t('画像は12MB以下にしてください。', 'The image must be 12 MB or smaller.'));
      return;
    }
    const targetRoomId = activeRoomId;
    const targetRoomName = room.en;
    const targetCeilingHeight = assumedCeilingHeight;
    void downscaleImage(file).then((imageData) => {
      const nextPhotoUrl = URL.createObjectURL(file);
      if (sourcePhotoUrl) URL.revokeObjectURL(sourcePhotoUrl);
      setRoomDrafts((current) => {
        const draft = current[targetRoomId] || createRoomDraft();
        return { ...current, [targetRoomId]: {
          ...draft,
          sourcePhotoUrl: nextPhotoUrl,
          sourcePhotoData: imageData,
          sourcePhotoName: file.name,
          previewUrl: undefined,
          previewStale: false,
          renderedAt: undefined,
          surfaceEstimate: undefined,
          quantities: {
            ...draft.quantities,
            [draft.selections.floor]: DEFAULT_SLOT_QUANTITY.floor,
            [draft.selections.walls]: DEFAULT_SLOT_QUANTITY.walls,
            [draft.selections.ceiling]: DEFAULT_SLOT_QUANTITY.ceiling,
          },
        } };
      });
      setViewMode('source');
      setPreviewError(undefined);
      setEstimateError(undefined);
      void estimateRoomSurfaces(imageData, targetRoomId, targetRoomName, targetCeilingHeight);
    }).catch((error) => {
      setPreviewError(t('画像を読み込めませんでした。', error instanceof Error ? error.message : 'The image could not be loaded.'));
    });
  };

  const updateSelection = (slot: SelectionSlot, itemId: string) => {
    updateActiveDraft((current) => ({
      selections: { ...current.selections, [slot]: itemId },
      quantities: { ...current.quantities, [itemId]: current.quantities[itemId] ?? surfaceQuantity(current.surfaceEstimate, slot) ?? DEFAULT_SLOT_QUANTITY[slot] },
      previewStale: Boolean(current.previewUrl),
    }));
  };

  const toggleSlot = (slot: SelectionSlot) => {
    updateActiveDraft((current) => ({
      enabledSlots: current.enabledSlots.includes(slot) ? current.enabledSlots.filter((id) => id !== slot) : [...current.enabledSlots, slot],
      previewStale: Boolean(current.previewUrl),
    }));
  };

  const toggleAccessory = (itemId: string) => {
    updateActiveDraft((current) => ({
      accessories: current.accessories.includes(itemId) ? current.accessories.filter((id) => id !== itemId) : [...current.accessories, itemId],
      previewStale: Boolean(current.previewUrl),
    }));
  };

  const updatePrice = (itemId: string, value: string) => {
    setPriceOverrides((current) => {
      const next = { ...current };
      if (value === '') delete next[itemId];
      else next[itemId] = Number(value);
      return next;
    });
  };

  const updateFinishScheduleCell = (rowId: string, field: FinishScheduleField, value: string) => {
    setFinishScheduleRows((current) => current.map((row) => row.id === rowId
      ? { ...row, [field]: { ...row[field], [language]: value } }
      : row));
  };

  const addRoom = () => {
    const id = `custom-${Date.now()}`;
    const roomNumber = roomTabs.filter((candidate) => candidate.custom).length + 1;
    const customRoom: RoomTab = { id, type: 'custom', ja: `追加室 ${roomNumber}`, en: `Custom room ${roomNumber}`, custom: true };
    setRoomTabs((current) => [...current, customRoom]);
    setRoomDrafts((current) => ({ ...current, [id]: createRoomDraft() }));
    setFinishScheduleRows((current) => [...current, blankFinishScheduleRow(id, customRoom.ja, customRoom.en)]);
    setActiveRoomId(id);
    setViewMode('source');
    setPreviewError(undefined);
    setEstimateError(undefined);
  };

  const removeRoom = (rowId: string) => {
    const fallbackId = roomTabs.find((candidate) => candidate.id !== rowId)?.id || DEFAULT_ROOM_TABS[0].id;
    setRoomTabs((current) => current.filter((candidate) => candidate.id !== rowId));
    setRoomDrafts((current) => {
      const next = { ...current };
      delete next[rowId];
      return next;
    });
    setFinishScheduleRows((current) => current.filter((row) => row.id !== rowId));
    if (activeRoomId === rowId) setActiveRoomId(fallbackId);
  };

  const switchRoom = (roomId: string) => {
    if (previewLoading || estimateLoading) return;
    setActiveRoomId(roomId);
    const nextDraft = roomDrafts[roomId];
    setViewMode(nextDraft?.previewUrl ? 'preview' : 'source');
    setPreviewError(undefined);
    setEstimateError(undefined);
  };

  const renameActiveRoom = (value: string) => {
    setRoomTabs((current) => current.map((candidate) => candidate.id === activeRoomId
      ? { ...candidate, [language]: value }
      : candidate));
    setFinishScheduleRows((current) => current.map((row) => row.id === activeRoomId
      ? { ...row, room: { ...row.room, [language]: value } }
      : row));
  };

  const estimateSurfaces = () => {
    if (!sourcePhotoData) {
      setEstimateError(t('先に室内写真をアップロードしてください。', 'Upload a room photo first.'));
      return;
    }
    void estimateRoomSurfaces(sourcePhotoData, activeRoomId, room.en, assumedCeilingHeight);
  };

  const generatePreview = async () => {
    if (!sourcePhotoData) {
      setPreviewError(t('先に既存の室内写真をアップロードしてください。', 'Upload a photo of the existing room first.'));
      return;
    }
    if (!selectedItems.length) {
      setPreviewError(t('反映する仕上げまたは家具を1つ以上選択してください。', 'Select at least one finish or furniture item to apply.'));
      return;
    }
    setPreviewLoading(true);
    setPreviewError(undefined);
    try {
      const response = await fetch('/api/generate-interior-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePhoto: sourcePhotoData,
          room: room.en,
          style: designStyle.en,
          note: requestNote,
          language,
          items: selectedItems.map((item) => ({
            section: item.section,
            name: item.nameEn,
            specification: item.specificationEn,
            color: item.colorEn,
            code: item.productCode,
            status: statusLabel(item.status, 'en'),
          })),
        }),
      });
      const payload = await readJsonResponse(response);
      if (!response.ok || !payload.image) throw new Error(payload.error || 'Preview generation failed');
      const renderedAt = new Date().toISOString();
      updateActiveDraft({ previewUrl: payload.image, previewStale: false, renderedAt });
      const finishFor = (slot: SelectionSlot, targetLanguage: Language) => {
        if (!enabledSlots.includes(slot)) return '—';
        const item = CATALOG.find((candidate) => candidate.id === selections[slot]);
        return item ? [itemName(item, targetLanguage), itemColor(item, targetLanguage), item.productCode].filter(Boolean).join('\n') : '—';
      };
      const remarksFor = (targetLanguage: Language) => {
        const detailIds = [
          ...activeSlotsForRoom(roomType)
            .filter((slot) => !['floor', 'walls', 'ceiling', 'backsplash'].includes(slot) && enabledSlots.includes(slot))
            .map((slot) => selections[slot]),
          ...accessories,
        ];
        const lines = detailIds
          .map((id) => CATALOG.find((item) => item.id === id))
          .filter(Boolean)
          .map((item) => itemName(item as CatalogItem, targetLanguage));
        return lines.length ? lines.join('\n') : '—';
      };
      setFinishScheduleRows((current) => current.map((row) => row.id === activeScheduleRoomId ? {
        ...row,
        floor: { ja: finishFor('floor', 'ja'), en: finishFor('floor', 'en') },
        baseboard: { ja: '木製巾木（仕上色合わせ）', en: 'Timber baseboard (finish matched)' },
        dado: { ja: finishFor('backsplash', 'ja'), en: finishFor('backsplash', 'en') },
        wall: { ja: finishFor('walls', 'ja'), en: finishFor('walls', 'en') },
        ceiling: { ja: finishFor('ceiling', 'ja'), en: finishFor('ceiling', 'en') },
        remarks: { ja: remarksFor('ja'), en: remarksFor('en') },
      } : row));
      setViewMode('preview');
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : t('AIプレビューの生成に失敗しました。', 'AI preview generation failed.'));
    } finally {
      setPreviewLoading(false);
    }
  };

  const buildProposalHtml = () => {
    const rows = selectedItems.map((item) => {
      const quantity = getQuantity(item);
      const unitPrice = getUnitPrice(item);
      const price = unitPrice === undefined ? t('見積対応', 'Price on request') : currency(unitPrice, language);
      const amount = unitPrice === undefined ? '—' : currency(quantity * unitPrice, language);
      const code = item.productCode || t('要確認', 'To be confirmed');
      const source = item.sourceUrl
        ? `<a href="${escapeHtml(item.sourceUrl)}">${escapeHtml(itemSource(item, language))}</a>`
        : escapeHtml(itemSource(item, language));
      return `<tr><td><span class="swatch" style="background:${item.swatch}"></span></td><td>${escapeHtml(SECTION_LABELS[item.section][language])}<small class="status">${escapeHtml(statusLabel(item.status, language))}</small></td><td><strong>${escapeHtml(itemName(item, language))}</strong><small>${escapeHtml(itemSpecification(item, language))}</small></td><td>${escapeHtml(item.size)}</td><td>${escapeHtml(itemColor(item, language))}<small>${escapeHtml(code)}</small></td><td>${escapeHtml(itemManufacturer(item, language))}<small>${source}</small></td><td class="num">${quantity}</td><td>${escapeHtml(itemUnit(item, language))}</td><td class="num">${price}</td><td class="num">${amount}</td></tr>`;
    }).join('');
    const generatedAt = new Intl.DateTimeFormat(language === 'ja' ? 'ja-JP' : 'en-US', { dateStyle: 'long' }).format(new Date());
    const preview = previewUrl ? `<img class="preview" src="${previewUrl}" alt="AI interior preview">` : `<div class="preview empty">${t('AIプレビュー未生成', 'AI preview not generated')}</div>`;
    const measurementSummary = surfaceEstimate
      ? `<div class="measurement"><strong>${t('写真からのAI面積概算', 'AI photo-based area estimate')}</strong><span>${t('床', 'Floor')} ${surfaceEstimate.floorAreaM2} m² · ${t('壁（開口控除）', 'Walls (net)')} ${surfaceEstimate.netWallAreaM2} m² · ${t('天井', 'Ceiling')} ${surfaceEstimate.ceilingAreaM2} m²</span><small>${escapeHtml(language === 'ja' ? surfaceEstimate.assumptionJa : surfaceEstimate.assumptionEn)}</small></div>`
      : '';
    const finishScheduleHtml = finishScheduleRows.map((row) => `<tr>${(['room', 'floor', 'baseboard', 'dado', 'wall', 'ceiling', 'remarks'] as FinishScheduleField[]).map((field) => `<td>${escapeHtml(scheduleText(row[field], language)).replaceAll('\n', '<br>')}</td>`).join('')}</tr>`).join('');
    const pricingNote = unpricedCount
      ? t(`未入力単価 ${unpricedCount}件は合計に含まれていません。`, `${unpricedCount} unpriced item(s) are excluded from totals.`)
      : t('全選定品に単価が入力されています。', 'All selected items have entered prices.');
    return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(projectName)} ${t('内部仕上表', 'Interior Finish Schedule')}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700&family=Chivo+Mono:wght@400;500&family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap"><style>body{margin:0;background:#f7f8fa;color:#1c1e21;font-family:'Inter','Noto Sans JP',system-ui,sans-serif;font-size:13px;line-height:1.5}.page{max-width:1280px;margin:32px auto;background:#fff;border:1px solid #e5e7eb;padding:48px}.top{display:flex;justify-content:space-between;gap:32px;border-bottom:1px solid #e5e7eb;padding-bottom:24px}.eyebrow{font-size:10px;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:#9ca3af}.eyebrow::after{content:"";display:block;width:48px;height:2px;margin-top:8px;background:#1f4cda}h1{margin:16px 0 8px;font-family:'Archivo','Noto Sans JP',system-ui,sans-serif;font-size:32px;font-weight:700;letter-spacing:-.03em}.meta{font-size:12px;color:#6b7280}.summary{text-align:right}.summary strong{font-size:13px;font-weight:600}.preview{display:block;width:100%;max-height:600px;object-fit:contain;margin:32px 0;border:1px solid #e5e7eb;background:#f5f6fa}.preview.empty{height:280px;display:grid;place-items:center;color:#9ca3af;font-size:12px}.measurement{display:flex;gap:16px;align-items:baseline;padding:14px 16px;background:#eef3fd;border-left:2px solid #1f4cda;font-size:12px}.measurement strong{font-weight:600}.measurement span{font-family:'Chivo Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}.measurement small{margin-left:auto;color:#6b7280}h2{margin:32px 0 12px;font-family:'Archivo','Noto Sans JP',system-ui,sans-serif;font-size:20px;font-weight:700;letter-spacing:-.03em}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#fff;text-align:left;padding:10px 8px;border-bottom:1px solid #e5e7eb;color:#9ca3af;font-size:10px;font-weight:600;letter-spacing:.15em;text-transform:uppercase}td{padding:10px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top}td small{display:block;color:#6b7280;margin-top:4px}.finish-grid{table-layout:fixed;border:1px solid #1c1e21}.finish-grid th,.finish-grid td{border:1px solid #1c1e21;padding:7px 8px;vertical-align:top;white-space:normal}.finish-grid th{color:#1c1e21;background:#f5f6fa;letter-spacing:.04em;text-transform:none}.finish-grid th:first-child,.finish-grid td:first-child{width:12%}.finish-grid th:last-child,.finish-grid td:last-child{width:17%}.status{font-weight:600;color:#1f4cda}.swatch{display:block;width:36px;height:30px;border:1px solid #e5e7eb}.num{text-align:right;font-family:'Chivo Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}.totals{width:380px;margin:24px 0 0 auto}.totals div{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb}.totals strong{font-family:'Chivo Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;font-weight:500}.totals .grand{font-size:18px;border-top:1px solid #1c1e21;border-bottom:0;margin-top:6px;padding-top:12px}.totals .grand strong{color:#1f4cda;font-weight:600}.pricing{color:#1f4cda;font-size:11px;text-align:right;margin-top:10px}.note{margin-top:32px;padding:14px 16px;background:#f5f6fa;font-size:11px;color:#6b7280}a{color:#1f4cda;text-decoration:none}@media print{body{background:#fff}.page{margin:0;max-width:none;border:0;padding:16px}.preview{max-height:350px}.finish-grid{font-size:9px}}</style></head><body><main class="page"><header class="top"><div><div class="eyebrow">ArchiX · Interior Proposal POC</div><h1>${escapeHtml(projectName)}</h1><div class="meta">${escapeHtml(customerName)} · ${escapeHtml(designStyle[language === 'ja' ? 'ja' : 'en'])}</div></div><div class="summary"><strong>${t('内部仕上表', 'Interior Finish Schedule')}</strong><div class="meta">${generatedAt}</div></div></header>${preview}${measurementSummary}<h2>${t('内部仕上表', 'Interior Finish Schedule')}</h2><table class="finish-grid"><thead><tr><th>${t('室名', 'Room')}</th><th>${t('床', 'Floor')}</th><th>${t('巾木', 'Baseboard')}</th><th>${t('腰', 'Dado / Wainscot')}</th><th>${t('壁', 'Wall')}</th><th>${t('天井', 'Ceiling')}</th><th>${t('備考', 'Remarks')}</th></tr></thead><tbody>${finishScheduleHtml}</tbody></table><h2>${t('見積明細', 'Estimate Details')}</h2><table><thead><tr><th>${t('画像', 'Image')}</th><th>${t('区分・状態', 'Section / status')}</th><th>${t('品名・仕様', 'Description / specification')}</th><th>${t('サイズ', 'Size')}</th><th>${t('色・品番', 'Color / code')}</th><th>${t('メーカー・出典', 'Maker / source')}</th><th>${t('数量', 'Qty')}</th><th>${t('単位', 'Unit')}</th><th>${t('単価', 'Unit price')}</th><th>${t('金額', 'Amount')}</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div><span>${t('小計', 'Subtotal')}</span><strong>${currency(subtotal, language)}</strong></div><div><span>${t('消費税 10%', 'Tax 10%')}</span><strong>${currency(tax, language)}</strong></div><div class="grand"><span>${t('合計', 'Total')}</span><strong>${currency(total, language)}</strong></div></div><div class="pricing">${escapeHtml(pricingNote)}</div><div class="note">${t('本書の品番・単価・家具はブランドを使用しないPOCサンプルです。写真からの面積はAI概算であり、正式見積・発注前に現場採寸と実商品データへ置き換えてください。AI画像は完成イメージであり、製品外観を保証しません。', 'SKUs, prices, and furniture in this document are unbranded POC samples. Photo-derived areas are AI estimates; replace them with site measurements and real product data before formal estimating or ordering. AI imagery is conceptual and does not guarantee exact product appearance.')}</div></main></body></html>`;
  };

  const exportCsv = () => {
    const header = language === 'ja'
      ? ['室名', '床', '巾木', '腰', '壁', '天井', '備考']
      : ['Room', 'Floor', 'Baseboard', 'Dado / Wainscot', 'Wall', 'Ceiling', 'Remarks'];
    const fields: FinishScheduleField[] = ['room', 'floor', 'baseboard', 'dado', 'wall', 'ceiling', 'remarks'];
    const rows = finishScheduleRows.map((row) => fields.map((field) => scheduleText(row[field], language)));
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    downloadBlob(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }), `asahi-interior-finish-schedule.csv`);
  };

  const exportProposal = () => downloadBlob(new Blob([buildProposalHtml()], { type: 'text/html;charset=utf-8' }), `asahi-${roomType}-interior-proposal.html`);

  const printProposal = () => {
    const popup = window.open('', '_blank');
    if (!popup) return;
    popup.opener = null;
    popup.document.write(buildProposalHtml());
    popup.document.close();
    popup.addEventListener('load', () => popup.print(), { once: true });
  };

  const surfaceSlotDefinitions = activeSlotDefinitions.filter((slot) => ['floor', 'walls', 'ceiling', 'backsplash'].includes(slot.id));
  const fixtureSlotDefinitions = activeSlotDefinitions.filter((slot) => !['floor', 'walls', 'ceiling', 'backsplash'].includes(slot.id));
  const renderSlotCards = (definitions: typeof activeSlotDefinitions) => definitions.map((slot) => {
    const item = CATALOG.find((candidate) => candidate.id === selections[slot.id])!;
    const checked = enabledSlots.includes(slot.id);
    return <div className={`change-check ${checked ? 'checked' : ''}`} key={slot.id}>
      <label><input type="checkbox" checked={checked} onChange={() => toggleSlot(slot.id)} /><span className="check-mark">✓</span><span className="mini-swatch" style={{ background: item.swatch }} /><span className="change-copy"><strong>{language === 'ja' ? slot.labelJa : slot.labelEn}</strong><small>{itemName(item, language)} · {itemColor(item, language)}</small></span></label>
      <select value={item.id} disabled={!checked} onChange={(event) => updateSelection(slot.id, event.target.value)}>{CATALOG.filter((candidate) => candidate.slot === slot.id).map((option) => <option key={option.id} value={option.id}>{itemName(option, language)} · {itemColor(option, language)}</option>)}</select>
    </div>;
  });
  const activeSummaryColumns = FINISH_SCHEDULE_COLUMNS.filter((column) => column.field !== 'room');

  return (
    <div className="studio-app">
      <header className="studio-header">
        <a href="#studio" className="studio-brand"><strong>Archi<span>X</span></strong><small>Interior Proposal POC</small></a>
        <div className="language-toggle" role="group" aria-label="Language"><button className={language === 'ja' ? 'active' : ''} onClick={() => setLanguage('ja')}>日本語</button><button className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button></div>
      </header>

      <main id="studio" className="studio-main">
        <section className="studio-title">
          <div>
            <span>Room Finish Studio</span>
            {language === 'ja'
              ? <h1>写真を見ながら、<span>仕上げ</span>と参考家具を選ぶ。</h1>
              : <h1>Choose <span>finishes</span> and reference furniture while viewing the room.</h1>}
          </div>
          <div className="live-count"><i />{t('仕上げ表', 'Schedule')} · {renderedRoomCount}/{roomTabs.length} {t('室レンダー済み', 'rooms rendered')}</div>
        </section>

        <nav className="room-tabs" aria-label={t('部屋を選択', 'Choose a room')}>
          <div className="room-tabs-scroll" role="tablist">
            {roomTabs.map((roomTab) => {
              const draft = roomDrafts[roomTab.id];
              const isRendering = previewLoading && roomTab.id === activeRoomId;
              const isEstimating = estimateLoading && roomTab.id === activeRoomId;
              const status = isRendering ? 'rendering' : isEstimating ? 'estimating' : draft?.previewUrl && draft.previewStale ? 'pending' : draft?.previewUrl ? 'rendered' : 'not-rendered';
              const statusCopy = status === 'rendering' ? t('生成中', 'Rendering') : status === 'estimating' ? t('面積推定中', 'Estimating size') : status === 'pending' ? t('変更あり', 'Changes pending') : status === 'rendered' ? t('生成済み', 'Rendered') : t('未生成', 'Not rendered');
              return <div key={roomTab.id} className={`room-tab-shell ${roomTab.id === activeRoomId ? 'active' : ''}`}>
                <button role="tab" aria-selected={roomTab.id === activeRoomId} className="room-tab" disabled={previewLoading || estimateLoading} onClick={() => switchRoom(roomTab.id)}>
                  <span className={`room-status-dot ${status}`} aria-hidden="true" />
                  <span><strong>{roomTab[language]}</strong><small>{statusCopy}</small></span>
                </button>
                {roomTab.custom && <button className="remove-room-tab" disabled={previewLoading || estimateLoading} aria-label={t('部屋を削除', 'Remove room')} onClick={() => removeRoom(roomTab.id)}>×</button>}
              </div>;
            })}
          </div>
          <button className="add-room-tab" disabled={previewLoading || estimateLoading} onClick={addRoom}>＋ {t('部屋を追加', 'Add room')}</button>
        </nav>

        <section className="quick-fields" aria-label={t('案件情報', 'Project details')}>
          <label><span>{t('案件名', 'Project')}</span><input value={projectName} onChange={(event) => setProjectName(event.target.value)} /></label>
          <label><span>{t('顧客', 'Customer')}</span><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></label>
          {room.custom && <label><span>{t('部屋名', 'Room name')}</span><input value={room[language]} onChange={(event) => renameActiveRoom(event.target.value)} /></label>}
          <label><span>{t('スタイル', 'Style')}</span><select value={style} onChange={(event) => updateActiveDraft({ style: event.target.value, previewStale: Boolean(previewUrl) })}>{STYLE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option[language === 'ja' ? 'ja' : 'en']}</option>)}</select></label>
          <label className="brief-field"><span>{t('要望', 'Brief')}</span><input value={requestNote} onChange={(event) => updateActiveDraft({ requestNote: event.target.value, previewStale: Boolean(previewUrl) })} /></label>
        </section>

        <section className="studio-workspace">
          <div className="visual-panel">
            <div className="visual-toolbar">
              <div className="view-tabs" role="tablist">
                <button className={viewMode === 'source' ? 'active' : ''} onClick={() => setViewMode('source')} disabled={!sourcePhotoUrl}>{t('元の写真', 'Original')}</button>
                <button className={viewMode === 'preview' ? 'active' : ''} onClick={() => setViewMode('preview')} disabled={!previewUrl}>{t('変更後', 'Preview')}</button>
              </div>
              <div className="visual-tools">
                <span className={`render-state ${previewUrl && !previewStale ? 'ready' : ''}`}>{previewLoading ? t('生成中…', 'Rendering…') : previewStale ? t('変更あり · 再生成が必要', 'Changes pending · render again') : previewUrl ? t('プレビュー生成済み', 'Preview ready') : t('未生成', 'Not rendered')}</span>
                <button className="change-photo" disabled={estimateLoading || previewLoading} onClick={() => fileInputRef.current?.click()}>{sourcePhotoUrl ? t('写真を変更', 'Change photo') : t('写真を選択', 'Choose photo')}</button>
              </div>
            </div>

            <section className="surface-estimator" aria-label={t('面積の自動推定', 'Automatic surface estimate')}>
              <div className="estimate-intro"><span>AI AREA ESTIMATE</span><strong>{estimateLoading ? t('写真から面積を自動推定中…', 'Automatically estimating areas…') : surfaceEstimate ? t('面積の自動推定が完了しました', 'Automatic area estimate complete') : t('写真アップロード時に自動推定', 'Estimated automatically on upload')}</strong><small>{t('床・壁・天井の概算数量へ反映します。正式見積前に現場採寸で確認してください。', 'Populates estimated floor, wall, and ceiling quantities. Confirm with site measurements before formal estimating.')}</small></div>
              <label className="height-input"><span>{t('想定天井高', 'Assumed height')}</span><div><input type="number" min="2" max="5" step="0.1" value={assumedCeilingHeight} onChange={(event) => updateActiveDraft({ assumedCeilingHeight: Number(event.target.value) || 2.4 })} /><em>m</em></div></label>
              <button className="estimate-button" disabled={!sourcePhotoData || estimateLoading} onClick={estimateSurfaces}>{estimateLoading ? t('推定中…', 'Estimating…') : surfaceEstimate ? t('再推定', 'Re-estimate') : t('推定を再試行', 'Retry estimate')}</button>
              {surfaceEstimate && <div className="estimate-result">
                <div><span>{t('床', 'Floor')}</span><strong>{surfaceEstimate.floorAreaM2} m²</strong></div>
                <div><span>{t('壁（開口控除）', 'Walls (net)')}</span><strong>{surfaceEstimate.netWallAreaM2} m²</strong></div>
                <div><span>{t('天井', 'Ceiling')}</span><strong>{surfaceEstimate.ceilingAreaM2} m²</strong></div>
                <p><b>{surfaceEstimate.roomWidthM} × {surfaceEstimate.roomDepthM} × H{surfaceEstimate.ceilingHeightM} m</b><span>{t('信頼度', 'Confidence')}: {surfaceEstimate.confidence === 'high' ? t('高', 'High') : surfaceEstimate.confidence === 'medium' ? t('中', 'Medium') : t('低', 'Low')}</span><small>{language === 'ja' ? surfaceEstimate.assumptionJa : surfaceEstimate.assumptionEn}</small></p>
              </div>}
              {estimateError && <div className="estimate-error">{estimateError}</div>}
            </section>

            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" hidden onChange={(event) => loadSourcePhoto(event.target.files?.[0])} />
            <div className={`visual-stage ${dragActive ? 'dragging' : ''} ${!sourcePhotoUrl ? 'empty' : ''}`} onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragActive(false)} onDrop={(event) => { event.preventDefault(); setDragActive(false); loadSourcePhoto(event.dataTransfer.files[0]); }} onClick={() => { if (!sourcePhotoUrl) fileInputRef.current?.click(); }} role={!sourcePhotoUrl ? 'button' : undefined} tabIndex={!sourcePhotoUrl ? 0 : undefined} onKeyDown={(event) => { if (!sourcePhotoUrl && event.key === 'Enter') fileInputRef.current?.click(); }}>
              {previewLoading ? <div className="rendering-message"><span className="studio-spinner" /><strong>{t('選んだ変更を反映しています', 'Applying your selected changes')}</strong><small>{t('30〜90秒ほどかかります', 'Usually 30–90 seconds')}</small></div>
                : viewMode === 'preview' && previewUrl ? <><img src={previewUrl} alt={t('変更後の室内', 'Updated room')} />{previewStale && <span className="stale-chip">{t('選択が変わりました · もう一度生成してください', 'Selections changed · render again')}</span>}</>
                  : sourcePhotoUrl ? <img src={sourcePhotoUrl} alt={t('元の室内写真', 'Original room')} />
                    : <div className="upload-message"><span>＋</span><strong>{room[language]} · {t('写真をアップロード', 'Upload a photo')}</strong><small>PNG / JPEG · {t('最大12MB · 面積は自動推定されます', '12 MB max · areas estimated automatically')}</small></div>}
            </div>

            {previewError && <div className="render-error"><strong>{t('生成できませんでした', 'Could not generate')}</strong><span>{previewError}</span></div>}
            <div className="render-bar">
              <p className="gemini-notice">{t('生成が完了すると、この部屋の選択内容が仕上表へ反映されます。写真と選択内容はGoogle Geminiへ送信されます。', 'When rendering completes, this room’s selections are committed to the finish schedule. The photo and selections are sent to Google Gemini.')}</p>
              <button className="render-button" disabled={previewLoading || estimateLoading || !sourcePhotoData || !selectedItems.length} onClick={generatePreview}>{previewLoading ? `${room[language]} ${t('生成中…', 'rendering…')}` : estimateLoading ? t('面積を推定しています…', 'Estimating room size…') : previewUrl ? t(`${room.ja}を再生成`, `Update ${room.en} render`) : t(`${room.ja}を生成`, `Render ${room.en}`)} <span>→</span></button>
            </div>
          </div>

          <aside className="changes-panel">
            <div className="changes-heading"><div><span>CHANGES TO APPLY</span><h2>{t('反映するもの', 'Choose what to change')}</h2></div><strong>{selectedItems.length}</strong></div>
            <div className="changes-scroll">
              <details className="selection-group" open>
                <summary><span>{t('床・壁・天井', 'Surfaces')}</span><small>{surfaceSlotDefinitions.filter((slot) => enabledSlots.includes(slot.id)).length}/{surfaceSlotDefinitions.length}</small></summary>
                <div className="selection-group-body">{renderSlotCards(surfaceSlotDefinitions)}</div>
              </details>
              {fixtureSlotDefinitions.length > 0 && <details className="selection-group">
                <summary><span>{t('設備・照明', 'Fixtures & lighting')}</span><small>{fixtureSlotDefinitions.filter((slot) => enabledSlots.includes(slot.id)).length}/{fixtureSlotDefinitions.length}</small></summary>
                <div className="selection-group-body">{renderSlotCards(fixtureSlotDefinitions)}</div>
              </details>}
              <details className="selection-group">
                <summary><span>{t('家具・アクセサリー', 'Furniture & accessories')}</span><small>{accessories.length} {t('点', 'selected')}</small></summary>
                <div className="selection-group-body">
                <p className="reference-note">{t('外部ブランドを使用しないPOC用の品番・価格です', 'Unbranded POC sample SKUs and prices')}</p>
                {CATALOG.filter((item) => item.section === 'accessory').map((item) => {
                  const checked = accessories.includes(item.id);
                  return <label className={`furniture-check ${checked ? 'checked' : ''}`} key={item.id}><input type="checkbox" checked={checked} onChange={() => toggleAccessory(item.id)} /><span className="check-mark">✓</span><span className="mini-swatch" style={{ background: item.swatch }} /><span><strong>{itemName(item, language)}</strong><small>{itemColor(item, language)} · {currency(item.unitPrice || 0, language)}</small></span></label>;
                })}
                </div>
              </details>
            </div>
            <div className="selection-total"><span>{t('選択中', 'Selected')}</span><strong>{selectedItems.length} {t('点', 'items')}</strong><em>{unpricedCount ? t(`未入力 ${unpricedCount}件`, `${unpricedCount} unpriced`) : currency(total, language)}</em></div>
          </aside>
        </section>

        <section className="active-finish-summary" aria-label={t('選択中の部屋の仕上げ', 'Active room finish summary')}>
          <header>
            <div><span>{t('現在の部屋', 'Current room')}</span><h2>{room[language]} · {t('仕上げ概要', 'Finish summary')}</h2></div>
            <div className="active-summary-actions">
              <span className={`summary-status ${activeRoomRendered ? 'rendered' : previewUrl ? 'pending' : ''}`}>{activeRoomRendered ? `✓ ${t('生成済み', 'Rendered')}` : previewUrl ? `↻ ${t('変更あり', 'Changes pending')}` : `○ ${t('未生成', 'Not rendered')}`}</span>
              <button onClick={() => { setScheduleView('finishes'); setScheduleExpanded(true); }}>{t('仕上表をすべて表示', 'View complete schedule')} →</button>
            </div>
          </header>
          <div className="active-finish-grid">
            {activeSummaryColumns.map((column) => <div key={column.field}><span>{language === 'ja' ? column.ja : column.en}</span><strong>{activeScheduleRow && scheduleText(activeScheduleRow[column.field], language) ? scheduleText(activeScheduleRow[column.field], language) : '—'}</strong></div>)}
          </div>
          {!activeRoomRendered && <p>{previewUrl ? t('変更内容を再生成すると、この概要と仕上表が更新されます。', 'Render the pending changes to update this summary and the finish schedule.') : t('この部屋を生成すると、選択した材料と設備がここに記録されます。', 'Render this room to record its selected materials and fixtures here.')}</p>}
        </section>

        {scheduleExpanded && <section className="schedule-panel">
          <div className="schedule-heading">
            <div><span><i /> LIVE</span><h2>{t('内部仕上表', 'Interior Finish Schedule')}</h2><p>{t('部屋ごとに床・巾木・腰・壁・天井・備考を整理します', 'Organize floor, baseboard, dado, wall, ceiling, and remarks by room')}</p></div>
            <div className="export-actions"><button onClick={() => setScheduleExpanded(false)}>{t('閉じる', 'Hide')}</button><button onClick={exportCsv}>{t('仕上表 CSV', 'Schedule CSV')}</button><button onClick={printProposal}>{t('印刷 / PDF', 'Print / PDF')}</button><button className="primary" onClick={exportProposal}>{t('提案書を出力', 'Export proposal')}</button></div>
          </div>
          <div className="schedule-view-tabs" role="tablist" aria-label={t('仕上表表示', 'Schedule view')}>
            <button className={scheduleView === 'finishes' ? 'active' : ''} onClick={() => setScheduleView('finishes')}>{t('内部仕上表', 'Finish schedule')}</button>
            <button className={scheduleView === 'estimate' ? 'active' : ''} onClick={() => setScheduleView('estimate')}>{t('見積明細', 'Estimate details')} <span>{selectedItems.length}</span></button>
          </div>

          {scheduleView === 'finishes' ? <>
            <div className="finish-sheet-title"><strong>{t('内 部 仕 上 表', 'INTERIOR FINISH SCHEDULE')}</strong><span>{t('生成済み', 'Rendered')}: {renderedRoomCount}/{roomTabs.length} {t('室', 'rooms')}</span></div>
            <div className="finish-matrix-wrap"><table className="finish-matrix"><thead><tr>{FINISH_SCHEDULE_COLUMNS.map((column) => <th key={column.field}>{language === 'ja' ? column.ja : column.en}</th>)}</tr></thead><tbody>
              {finishScheduleRows.map((row) => <tr key={row.id} className={row.id === activeScheduleRoomId ? 'active-room' : ''}>
                {FINISH_SCHEDULE_COLUMNS.map((column) => <td key={column.field}>
                  <textarea aria-label={`${scheduleText(row.room, language)} · ${language === 'ja' ? column.ja : column.en}`} rows={column.field === 'room' ? 2 : 3} value={scheduleText(row[column.field], language)} placeholder="—" onChange={(event) => updateFinishScheduleCell(row.id, column.field, event.target.value)} />
                  {column.field === 'room' && row.id.startsWith('custom-') && <button className="remove-room" aria-label={t('部屋を削除', 'Remove room')} onClick={() => removeRoom(row.id)}>×</button>}
                  {column.field === 'room' && <small className={roomDrafts[row.id]?.previewUrl && !roomDrafts[row.id]?.previewStale ? 'schedule-rendered' : 'schedule-unrendered'}>{roomDrafts[row.id]?.previewUrl && !roomDrafts[row.id]?.previewStale ? t('生成済み', 'Rendered') : roomDrafts[row.id]?.previewUrl ? t('再生成待ち', 'Awaiting re-render') : t('未生成', 'Not rendered')}</small>}
                </td>)}
              </tr>)}
            </tbody></table></div>
            <div className="finish-sheet-footer"><button onClick={addRoom}>＋ {t('部屋を追加', 'Add room')}</button><p>{t('レンダーが完了した時点で、その部屋の床・壁・天井・設備が仕上表へ反映されます。青い行が現在編集中の部屋です。各セルは直接編集できます。', 'When a render completes, that room’s floor, wall, ceiling, and fixture selections are committed to the schedule. The blue row is the room currently being edited; every cell remains directly editable.')}</p></div>
          </> : <>
            <div className="schedule-table-wrap"><table className="schedule-table"><thead><tr><th>{t('選定品', 'Selected item')}</th><th>{t('区分・状態', 'Type / status')}</th><th>{t('色・品番', 'Color / code')}</th><th>{t('メーカー・出典', 'Maker / source')}</th><th>{t('数量', 'Qty')}</th><th>{t('単価', 'Unit price')}</th><th>{t('金額', 'Amount')}</th></tr></thead><tbody>
              {selectedItems.length ? selectedItems.map((item) => {
                const quantity = getQuantity(item); const unitPrice = getUnitPrice(item);
                const isAiQuantity = Boolean(surfaceEstimate && item.slot && ['floor', 'walls', 'ceiling'].includes(item.slot));
                return <tr key={item.id}><td><div className="schedule-item"><span style={{ background: item.swatch }} /><div><strong>{itemName(item, language)}</strong><small>{itemSpecification(item, language)} · {item.size}</small></div></div></td><td><span className={`type-pill ${item.section}`}>{SECTION_LABELS[item.section][language]}</span><span className={`status-pill ${item.status}`}>{statusLabel(item.status, language)}</span></td><td>{itemColor(item, language)}<code>{item.productCode || t('品番要確認', 'SKU to confirm')}</code></td><td><span className="maker-name">{itemManufacturer(item, language)}</span>{item.sourceUrl ? <a className="source-link" href={item.sourceUrl} target="_blank" rel="noreferrer">{itemSource(item, language)} ↗</a> : <small>{itemSource(item, language)}</small>}</td><td><div className="qty-control"><input type="number" min="0" step="0.1" value={quantity} onChange={(event) => updateActiveDraft((current) => ({ quantities: { ...current.quantities, [item.id]: Number(event.target.value) } }))} /><span>{itemUnit(item, language)}</span>{isAiQuantity && <small>{t('AI概算', 'AI est.')}</small>}</div></td><td><input className={`unit-price ${unitPrice === undefined ? 'unpriced' : ''}`} aria-label={`${itemName(item, language)} ${t('単価', 'unit price')}`} type="number" min="0" step="100" value={unitPrice ?? ''} placeholder={t('見積', 'Quote')} onChange={(event) => updatePrice(item.id, event.target.value)} /></td><td className="line-total">{unitPrice === undefined ? '—' : currency(quantity * unitPrice, language)}</td></tr>;
              }) : <tr><td colSpan={7} className="empty-schedule">{t('右側のチェックボックスから反映する項目を選んでください。', 'Choose items from the checklist to build the estimate.')}</td></tr>}
            </tbody></table></div>
            <div className="schedule-footer"><p>{t('見積明細は仕上表とは分けて管理します。数量・単価はPOC用で、正式見積前に確認してください。', 'Estimate details are kept separate from the finish schedule. Quantities and prices are POC values and require confirmation before formal estimating.')}{unpricedCount > 0 && <strong className="pricing-warning"> {t(`未入力単価 ${unpricedCount}件は合計に含まれません。`, `${unpricedCount} unpriced item(s) are excluded from totals.`)}</strong>}</p><div className="schedule-totals"><span>{t('小計', 'Subtotal')} <strong>{currency(subtotal, language)}</strong></span><span>{t('消費税', 'Tax')} <strong>{currency(tax, language)}</strong></span><span className="total">{t('合計', 'Total')} <strong>{currency(total, language)}</strong></span></div></div>
          </>}
        </section>}
      </main>
    </div>
  );
}
