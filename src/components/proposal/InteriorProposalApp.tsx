import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { blankFinishScheduleRow, cloneFinishSchedule, scheduleText, DERIVED_SCHEDULE_FIELDS, type DerivedFinishScheduleField, type FinishScheduleField, type FinishScheduleRow } from './finishSchedule';
import { prepareImage, readJsonResponse, MAX_PAIRED_IMAGE_LENGTH, MAX_SINGLE_IMAGE_LENGTH } from './downscaleImage';
import FloorplanWorkspace, { type AppliedFloorplanRoom, type FloorFinishPreview, type FloorplanSurface } from './FloorplanWorkspace';
import '../../styles/archix.css';
import './InteriorProposalApp.css';

interface RoomTab {
  id: string;
  type: 'kitchen' | 'living' | 'dining' | 'bathroom' | 'bedroom' | 'custom';
  ja: string;
  en: string;
  custom?: boolean;
  sourceFloorplanRoomId?: string;
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
  { field: 'dado', ja: '腰', en: 'Wainscot' },
  { field: 'wall', ja: '壁', en: 'Wall' },
  { field: 'ceiling', ja: '天井', en: 'Ceiling' },
  { field: 'remarks', ja: '備考', en: 'Remarks' },
];

const DEFAULT_SLOT_QUANTITY: Record<SelectionSlot, number> = {
  floor: 42, walls: 118, ceiling: 42, counter: 1, cabinet: 1, backsplash: 1, faucet: 1, sink: 1, hardware: 12, lighting: 3,
};
const PROJECT_STORAGE_KEY = 'archix-interior-project-v1';

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
  measurementSource?: 'floorplan-ai-reviewed' | 'photo-ai-suggestion';
  reviewedAt?: string;
  validationIssues?: string[];
  measurementStatus?: string;
  model?: string;
  promptVersion?: string;
}

interface PreviewVerification {
  status: 'pass' | 'review' | 'fail';
  structureScore: number;
  scheduleScore: number;
  structurePreserved: boolean;
  selectedItemsPresent: boolean;
  issues: string[];
  missingItems: string[];
  unexpectedChanges: string[];
  model?: string;
  verifierType?: string;
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
  previewVerification?: PreviewVerification;
  previewApprovedAt?: string;
  renderMetadata?: { model?: string; promptVersion?: string; generatedAt: string };
  assumedCeilingHeight: number;
  surfaceEstimate?: SurfaceEstimate;
  surfaceEstimateSuggestion?: SurfaceEstimate;
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

const floorplanSourceIdFor = (roomTab: RoomTab) => roomTab.sourceFloorplanRoomId || roomTab.id.match(/^plan-\d+-(.+)$/)?.[1];

const CATALOG_BY_ID = new Map(CATALOG.map((item) => [item.id, item]));
const catalogItem = (id: string | undefined) => (id ? CATALOG_BY_ID.get(id) : undefined);
const CATALOG_BY_SLOT = SLOT_DEFINITIONS.reduce((map, slot) => {
  map.set(slot.id, CATALOG.filter((item) => item.slot === slot.id));
  return map;
}, new Map<SelectionSlot, CatalogItem[]>());
const ACCESSORY_CATALOG = CATALOG.filter((item) => item.section === 'accessory');

const ROOM_TYPES: RoomTab['type'][] = ['kitchen', 'living', 'dining', 'bathroom', 'bedroom', 'custom'];

const sanitizeRoomTabs = (value: unknown): RoomTab[] => {
  const tabs = (Array.isArray(value) ? value : []).flatMap((entry: any) => {
    if (!entry || typeof entry.id !== 'string' || !entry.id) return [];
    if (entry.sourceFloorplanRoomId || /^plan-\d+-/.test(entry.id)) return [];
    return [{
      id: entry.id,
      type: ROOM_TYPES.includes(entry.type) ? entry.type : 'custom',
      ja: typeof entry.ja === 'string' && entry.ja ? entry.ja : entry.id,
      en: typeof entry.en === 'string' && entry.en ? entry.en : entry.id,
      custom: entry.custom === true,
      sourceFloorplanRoomId: typeof entry.sourceFloorplanRoomId === 'string' ? entry.sourceFloorplanRoomId : undefined,
    } as RoomTab];
  });
  const unique = tabs.filter((tab, index) => tabs.findIndex((candidate) => candidate.id === tab.id) === index);
  return unique.length ? unique : DEFAULT_ROOM_TABS;
};

const sanitizeRoomDraft = (value: unknown): RoomDraft => {
  const draft = (value && typeof value === 'object' ? value : {}) as Partial<RoomDraft>;
  const base = createRoomDraft();
  const selections = { ...base.selections };
  (Object.keys(base.selections) as SelectionSlot[]).forEach((slot) => {
    const persisted = draft.selections?.[slot];
    const item = catalogItem(persisted);
    if (item && item.slot === slot) selections[slot] = persisted as string;
  });
  return {
    ...base,
    ...draft,
    selections,
    enabledSlots: (Array.isArray(draft.enabledSlots) ? draft.enabledSlots : base.enabledSlots).filter((slot) => slot in base.selections),
    accessories: (Array.isArray(draft.accessories) ? draft.accessories : []).filter((id) => catalogItem(id)?.section === 'accessory'),
    quantities: draft.quantities && typeof draft.quantities === 'object'
      ? Object.fromEntries(Object.entries(draft.quantities).filter(([, quantity]) => Number.isFinite(quantity)))
      : { ...base.quantities },
    assumedCeilingHeight: Number.isFinite(draft.assumedCeilingHeight) ? (draft.assumedCeilingHeight as number) : base.assumedCeilingHeight,
    sourcePhotoUrl: undefined,
    sourcePhotoData: undefined,
    previewUrl: undefined,
    previewStale: false,
  };
};

const sanitizeScheduleRow = (value: unknown, tab: RoomTab): FinishScheduleRow => {
  const row = (value && typeof value === 'object' ? value : {}) as Partial<FinishScheduleRow>;
  const blank = blankFinishScheduleRow(tab.id, tab.ja, tab.en);
  const localized = (field: FinishScheduleField) => {
    const persisted = row[field] as { ja?: unknown; en?: unknown } | undefined;
    return {
      ja: typeof persisted?.ja === 'string' ? persisted.ja : blank[field].ja,
      en: typeof persisted?.en === 'string' ? persisted.en : blank[field].en,
    };
  };
  return {
    id: tab.id,
    room: localized('room'),
    floor: localized('floor'),
    baseboard: localized('baseboard'),
    dado: localized('dado'),
    wall: localized('wall'),
    ceiling: localized('ceiling'),
    remarks: localized('remarks'),
    edited: (Array.isArray(row.edited) ? row.edited : []).filter((field): field is DerivedFinishScheduleField => DERIVED_SCHEDULE_FIELDS.includes(field as DerivedFinishScheduleField)),
  };
};

const surfaceQuantity = (estimate: SurfaceEstimate | undefined, slot: SelectionSlot) => {
  if (!estimate) return undefined;
  if (slot === 'floor') return estimate.floorAreaM2;
  if (slot === 'walls') return estimate.netWallAreaM2;
  if (slot === 'ceiling') return estimate.ceilingAreaM2;
  return undefined;
};

const finishSchedulePatch = (draft: RoomDraft, roomType: RoomTab['type']): Pick<FinishScheduleRow, 'floor' | 'baseboard' | 'dado' | 'wall' | 'ceiling' | 'remarks'> => {
  const finishFor = (slot: SelectionSlot, targetLanguage: Language) => {
    if (!draft.enabledSlots.includes(slot)) return '—';
    const item = catalogItem(draft.selections[slot]);
    return item ? [itemName(item, targetLanguage), itemColor(item, targetLanguage), item.productCode].filter(Boolean).join('\n') : '—';
  };
  const remarksFor = (targetLanguage: Language) => {
    const detailIds = [
      ...activeSlotsForRoom(roomType)
        .filter((slot) => !['floor', 'walls', 'ceiling', 'backsplash'].includes(slot) && draft.enabledSlots.includes(slot))
        .map((slot) => draft.selections[slot]),
      ...draft.accessories,
    ];
    const lines = detailIds
      .map((id) => catalogItem(id))
      .filter(Boolean)
      .map((item) => itemName(item as CatalogItem, targetLanguage));
    if (draft.surfaceEstimate) lines.push(targetLanguage === 'ja'
      ? `数量：床 ${draft.surfaceEstimate.floorAreaM2} m²・壁 ${draft.surfaceEstimate.netWallAreaM2} m²・天井 ${draft.surfaceEstimate.ceilingAreaM2} m²`
      : `Quantities: floor ${draft.surfaceEstimate.floorAreaM2} m² · walls ${draft.surfaceEstimate.netWallAreaM2} m² · ceiling ${draft.surfaceEstimate.ceilingAreaM2} m²`);
    return lines.length ? lines.join('\n') : '—';
  };
  return {
    floor: { ja: finishFor('floor', 'ja'), en: finishFor('floor', 'en') },
    baseboard: { ja: '木製巾木（仕上色合わせ）', en: 'Timber baseboard (finish matched)' },
    dado: { ja: finishFor('backsplash', 'ja'), en: finishFor('backsplash', 'en') },
    wall: { ja: finishFor('walls', 'ja'), en: finishFor('walls', 'en') },
    ceiling: { ja: finishFor('ceiling', 'ja'), en: finishFor('ceiling', 'en') },
    remarks: { ja: remarksFor('ja'), en: remarksFor('en') },
  };
};

const withSchedulePatch = (row: FinishScheduleRow, patch: ReturnType<typeof finishSchedulePatch>): FinishScheduleRow => {
  const applied = DERIVED_SCHEDULE_FIELDS.filter((field) => !row.edited?.includes(field)
    && (row[field].ja !== patch[field].ja || row[field].en !== patch[field].en));
  return applied.length ? { ...row, ...Object.fromEntries(applied.map((field) => [field, patch[field]])) } : row;
};

const isPristineDraft = (draft: RoomDraft) => {
  const base = createRoomDraft();
  return !draft.accessories.length
    && !draft.surfaceEstimate
    && draft.enabledSlots.length === base.enabledSlots.length
    && draft.enabledSlots.every((slot) => base.enabledSlots.includes(slot))
    && (Object.keys(base.selections) as SelectionSlot[]).every((slot) => draft.selections[slot] === base.selections[slot]);
};

const isBlankScheduleRow = (row: FinishScheduleRow) => DERIVED_SCHEDULE_FIELDS.every((field) => !row[field].ja && !row[field].en);

const currency = (value: number, language: Language) => new Intl.NumberFormat(language === 'ja' ? 'ja-JP' : 'en-US', {
  style: 'currency', currency: 'JPY', maximumFractionDigits: 0,
}).format(value);

interface ScheduleRowProps {
  row: FinishScheduleRow;
  columns: Array<{ field: FinishScheduleField; ja: string; en: string }>;
  language: Language;
  isActive: boolean;
  canRemove: boolean;
  renderedLabel: string;
  onChangeCell: (rowId: string, field: FinishScheduleField, value: string) => void;
  onRestoreCell: (rowId: string, field: DerivedFinishScheduleField) => void;
  onRemoveRoom: (rowId: string) => void;
  removeLabel: string;
  restoreLabel: string;
  liveLabel: string;
}

const ScheduleRow = React.memo(function ScheduleRow({
  row, columns, language, isActive, canRemove, renderedLabel, onChangeCell, onRestoreCell, onRemoveRoom, removeLabel, restoreLabel, liveLabel,
}: ScheduleRowProps) {
  return <tr className={isActive ? 'active-room' : ''}>
    {columns.map((column) => {
      const isEdited = row.edited?.includes(column.field as DerivedFinishScheduleField);
      return <td key={column.field} className={isEdited ? 'manually-edited' : undefined}>
        <textarea aria-label={`${scheduleText(row.room, language)} · ${language === 'ja' ? column.ja : column.en}`} rows={column.field === 'room' ? 2 : 3} value={scheduleText(row[column.field], language)} placeholder="—" onChange={(event) => onChangeCell(row.id, column.field, event.target.value)} />
        {isEdited && <button className="restore-cell" title={restoreLabel} aria-label={restoreLabel} onClick={() => onRestoreCell(row.id, column.field as DerivedFinishScheduleField)}>↺</button>}
        {column.field === 'room' && canRemove && <button className="remove-room" aria-label={removeLabel} onClick={() => onRemoveRoom(row.id)}>×</button>}
        {column.field === 'room' && <small className="schedule-rendered">✓ {liveLabel}{renderedLabel}</small>}
      </td>;
    })}
  </tr>;
});

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
  const [workspaceView, setWorkspaceView] = useState<'floorplan' | 'room'>('floorplan');
  const [roomDrafts, setRoomDrafts] = useState<Record<string, RoomDraft>>(createInitialRoomDrafts);
  const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({});
  const [viewMode, setViewMode] = useState<'source' | 'preview'>('source');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string>();
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState<string>();
  const [finishScheduleRows, setFinishScheduleRows] = useState(cloneFinishSchedule);
  const [scheduleView, setScheduleView] = useState<'finishes' | 'estimate' | 'project'>('finishes');
  const [scheduleExpanded, setScheduleExpanded] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [saveState, setSaveState] = useState<'loading' | 'saving' | 'saved' | 'unavailable'>('loading');
  const [savedAt, setSavedAt] = useState<string>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectHydratedRef = useRef(false);
  const roomDraftsRef = useRef<Record<string, RoomDraft>>({});

  const t = (ja: string, en: string) => pick(language, ja, en);
  const room = roomTabs.find((candidate) => candidate.id === activeRoomId) || roomTabs[0] || DEFAULT_ROOM_TABS[0];
  const roomType = room.type;
  const activeDraft = useMemo(() => roomDrafts[activeRoomId] || createRoomDraft(), [roomDrafts, activeRoomId]);
  const { style, requestNote, sourcePhotoUrl, sourcePhotoData, sourcePhotoName, selections, enabledSlots, accessories, quantities, previewUrl, previewStale, previewVerification, previewApprovedAt, assumedCeilingHeight, surfaceEstimate, surfaceEstimateSuggestion } = activeDraft;
  const usesFloorplanTakeoff = Boolean(floorplanSourceIdFor(room));
  const displayedSurfaceEstimate = surfaceEstimateSuggestion || surfaceEstimate;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PROJECT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.language === 'ja' || parsed.language === 'en') setLanguage(parsed.language);
        if (typeof parsed.projectName === 'string') setProjectName(parsed.projectName);
        if (typeof parsed.customerName === 'string') setCustomerName(parsed.customerName);
        const restoredTabs = sanitizeRoomTabs(parsed.roomTabs);
        const restoredDrafts = Object.fromEntries(restoredTabs.map((tab) => [tab.id, sanitizeRoomDraft(parsed.roomDrafts?.[tab.id])]));
        const persistedRows: unknown[] = Array.isArray(parsed.finishScheduleRows) ? parsed.finishScheduleRows : [];
        const restoredRows = restoredTabs.map((tab) => sanitizeScheduleRow(persistedRows.find((row: any) => row?.id === tab.id), tab));
        setRoomTabs(restoredTabs);
        setRoomDrafts(restoredDrafts);
        setFinishScheduleRows(restoredRows);
        setActiveRoomId(restoredTabs.some((tab) => tab.id === parsed.activeRoomId) ? parsed.activeRoomId : restoredTabs[0].id);
        if (parsed.workspaceView === 'floorplan' || parsed.workspaceView === 'room') setWorkspaceView(parsed.workspaceView);
        if (parsed.priceOverrides && typeof parsed.priceOverrides === 'object') {
          setPriceOverrides(Object.fromEntries(Object.entries(parsed.priceOverrides as Record<string, unknown>)
            .filter(([id, price]) => catalogItem(id) && Number.isFinite(price)) as Array<[string, number]>));
        }
        if (parsed.scheduleView === 'finishes' || parsed.scheduleView === 'estimate' || parsed.scheduleView === 'project') setScheduleView(parsed.scheduleView);
        if (typeof parsed.scheduleExpanded === 'boolean') setScheduleExpanded(parsed.scheduleExpanded);
        if (typeof parsed.savedAt === 'string') setSavedAt(parsed.savedAt);
      }
      setSaveState('saved');
    } catch {
      setSaveState('unavailable');
    } finally {
      projectHydratedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!projectHydratedRef.current) return;
    setSaveState('saving');
    const timeout = window.setTimeout(() => {
      try {
        const persistableDrafts = Object.fromEntries(Object.entries(roomDrafts).map(([id, draft]) => [id, {
          ...draft,
          sourcePhotoUrl: undefined,
          sourcePhotoData: undefined,
          previewUrl: undefined,
        }]));
        const nextSavedAt = new Date().toISOString();
        localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify({
          language, projectName, customerName, roomTabs, activeRoomId, workspaceView,
          roomDrafts: persistableDrafts, priceOverrides, finishScheduleRows,
          scheduleView, scheduleExpanded, savedAt: nextSavedAt,
        }));
        setSavedAt(nextSavedAt);
        setSaveState('saved');
      } catch {
        setSaveState('unavailable');
      }
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [language, projectName, customerName, roomTabs, activeRoomId, workspaceView, roomDrafts, priceOverrides, finishScheduleRows, scheduleView, scheduleExpanded]);

  useEffect(() => { roomDraftsRef.current = roomDrafts; }, [roomDrafts]);

  useEffect(() => () => {
    Object.values(roomDraftsRef.current).forEach((draft) => {
      if (draft.sourcePhotoUrl) URL.revokeObjectURL(draft.sourcePhotoUrl);
    });
  }, []);

  useEffect(() => {
    setFinishScheduleRows((current) => {
      const index = current.findIndex((row) => row.id === activeRoomId);
      if (index < 0) return current;
      if (isPristineDraft(activeDraft) && isBlankScheduleRow(current[index])) return current;
      const patched = withSchedulePatch(current[index], finishSchedulePatch(activeDraft, roomType));
      if (patched === current[index]) return current;
      const next = [...current];
      next[index] = patched;
      return next;
    });
  }, [activeRoomId, roomType, activeDraft, selections, enabledSlots, accessories, surfaceEstimate, finishScheduleRows]);

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
    return ids.map((id) => catalogItem(id)).filter(Boolean) as CatalogItem[];
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

  const projectLines = useMemo(() => {
    const aggregate = new Map<string, { item: CatalogItem; quantity: number; rooms: string[] }>();
    roomTabs.forEach((roomTab) => {
      const draft = roomDrafts[roomTab.id];
      if (!draft) return;
      const itemIds = new Set([
        ...activeSlotsForRoom(roomTab.type).filter((slot) => draft.enabledSlots.includes(slot)).map((slot) => draft.selections[slot]),
        ...draft.accessories,
      ]);
      itemIds.forEach((itemId) => {
        const item = catalogItem(itemId);
        if (!item) return;
        const fallback = item.slot ? DEFAULT_SLOT_QUANTITY[item.slot] : DEFAULT_QUANTITIES[item.id] ?? 1;
        const quantity = draft.quantities[item.id] ?? fallback;
        const existing = aggregate.get(item.id);
        if (existing) {
          existing.quantity += quantity;
          existing.rooms.push(roomTab[language]);
        } else {
          aggregate.set(item.id, { item, quantity, rooms: [roomTab[language]] });
        }
      });
    });
    return [...aggregate.values()].sort((a, b) => a.item.section.localeCompare(b.item.section) || itemName(a.item, language).localeCompare(itemName(b.item, language)));
  }, [roomTabs, roomDrafts, language]);
  const projectSubtotal = projectLines.reduce((sum, line) => sum + (priceOverrides[line.item.id] ?? line.item.unitPrice ?? 0) * line.quantity, 0);
  const projectTax = Math.round(projectSubtotal * 0.1);
  const projectTotal = projectSubtotal + projectTax;
  const projectUnpricedCount = projectLines.filter((line) => (priceOverrides[line.item.id] ?? line.item.unitPrice) === undefined).length;
  const activeScheduleRoomId = activeRoomId;
  const renderedRoomCount = roomTabs.filter((candidate) => roomDrafts[candidate.id]?.previewUrl && !roomDrafts[candidate.id]?.previewStale && roomDrafts[candidate.id]?.previewApprovedAt).length;
  const activeScheduleRow = finishScheduleRows.find((row) => row.id === activeScheduleRoomId);
  const linkedFloorplanRoomIds = useMemo(() => Object.fromEntries(roomTabs.flatMap((roomTab) => {
    const sourceRoomId = floorplanSourceIdFor(roomTab);
    return sourceRoomId ? [[sourceRoomId, roomTab.id]] : [];
  })), [roomTabs]);
  const floorFinishPreviews = useMemo<Record<string, FloorFinishPreview>>(() => Object.fromEntries(roomTabs.flatMap((roomTab) => {
    const sourceRoomId = floorplanSourceIdFor(roomTab);
    const draft = roomDrafts[roomTab.id];
    if (!sourceRoomId || !draft || !draft.enabledSlots.includes('floor')) return [];
    const floorItem = catalogItem(draft.selections.floor);
    return floorItem ? [[sourceRoomId, {
      swatch: floorItem.swatch,
      label: `${itemName(floorItem, language)} · ${itemColor(floorItem, language)}`,
      roomName: roomTab[language],
    }]] : [];
  })), [roomTabs, roomDrafts, language]);
  const linkedFloorplanRoomCount = Object.keys(linkedFloorplanRoomIds).length;

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
      const estimate = { ...payload.estimate, model: payload.model, promptVersion: payload.promptVersion } as SurfaceEstimate;
      setRoomDrafts((current) => {
        const draft = current[targetRoomId];
        if (!draft) return current;
        return {
          ...current,
          [targetRoomId]: {
            ...draft,
            surfaceEstimateSuggestion: { ...estimate, measurementSource: 'photo-ai-suggestion' },
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
    const targetUsesFloorplanTakeoff = usesFloorplanTakeoff;
    void prepareImage(file, { maxEdge: 2560, jpegQuality: 0.92, maxLength: MAX_SINGLE_IMAGE_LENGTH }).then((imageData) => {
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
          previewVerification: undefined,
          previewApprovedAt: undefined,
          renderMetadata: undefined,
          renderedAt: undefined,
          surfaceEstimate: targetUsesFloorplanTakeoff ? draft.surfaceEstimate : undefined,
          surfaceEstimateSuggestion: undefined,
          quantities: targetUsesFloorplanTakeoff ? draft.quantities : {
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
      if (!targetUsesFloorplanTakeoff) void estimateRoomSurfaces(imageData, targetRoomId, targetRoomName, targetCeilingHeight);
    }).catch((error) => {
      setPreviewError(t('画像を読み込めませんでした。', error instanceof Error ? error.message : 'The image could not be loaded.'));
    });
  };

  const updateSelection = (slot: SelectionSlot, itemId: string) => {
    updateActiveDraft((current) => ({
      selections: { ...current.selections, [slot]: itemId },
      quantities: { ...current.quantities, [itemId]: current.quantities[itemId] ?? surfaceQuantity(current.surfaceEstimate, slot) ?? DEFAULT_SLOT_QUANTITY[slot] },
      previewStale: Boolean(current.previewUrl),
      previewVerification: undefined,
      previewApprovedAt: undefined,
    }));
  };

  const acceptSurfaceEstimate = () => {
    if (!surfaceEstimateSuggestion || usesFloorplanTakeoff) return;
    updateActiveDraft((draft) => ({
      surfaceEstimate: { ...surfaceEstimateSuggestion, reviewedAt: new Date().toISOString() },
      surfaceEstimateSuggestion: undefined,
      quantities: {
        ...draft.quantities,
        [draft.selections.floor]: surfaceEstimateSuggestion.floorAreaM2,
        [draft.selections.walls]: surfaceEstimateSuggestion.netWallAreaM2,
        [draft.selections.ceiling]: surfaceEstimateSuggestion.ceilingAreaM2,
      },
    }));
  };

  const discardSurfaceEstimate = () => updateActiveDraft({ surfaceEstimateSuggestion: undefined });

  const toggleSlot = (slot: SelectionSlot) => {
    updateActiveDraft((current) => ({
      enabledSlots: current.enabledSlots.includes(slot) ? current.enabledSlots.filter((id) => id !== slot) : [...current.enabledSlots, slot],
      previewStale: Boolean(current.previewUrl),
      previewVerification: undefined,
      previewApprovedAt: undefined,
    }));
  };

  const toggleAccessory = (itemId: string) => {
    updateActiveDraft((current) => ({
      accessories: current.accessories.includes(itemId) ? current.accessories.filter((id) => id !== itemId) : [...current.accessories, itemId],
      previewStale: Boolean(current.previewUrl),
      previewVerification: undefined,
      previewApprovedAt: undefined,
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

  const updateFinishScheduleCell = useCallback((rowId: string, field: FinishScheduleField, value: string) => {
    setFinishScheduleRows((current) => current.map((row) => {
      if (row.id !== rowId) return row;
      const derived = DERIVED_SCHEDULE_FIELDS.includes(field as DerivedFinishScheduleField);
      const edited = derived && !row.edited?.includes(field as DerivedFinishScheduleField)
        ? [...(row.edited || []), field as DerivedFinishScheduleField]
        : row.edited;
      return { ...row, [field]: { ...row[field], [language]: value }, edited };
    }));
  }, [language]);

  const restoreDerivedScheduleCell = useCallback((rowId: string, field: DerivedFinishScheduleField) => {
    setFinishScheduleRows((current) => current.map((row) => row.id === rowId
      ? { ...row, edited: (row.edited || []).filter((candidate) => candidate !== field) }
      : row));
  }, []);

  const addRoom = () => {
    const id = `custom-${Date.now()}`;
    const roomNumber = roomTabs.filter((candidate) => candidate.custom).length + 1;
    const customRoom: RoomTab = { id, type: 'custom', ja: `追加室 ${roomNumber}`, en: `Custom room ${roomNumber}`, custom: true };
    setRoomTabs((current) => [...current, customRoom]);
    setRoomDrafts((current) => ({ ...current, [id]: createRoomDraft() }));
    setFinishScheduleRows((current) => [...current, blankFinishScheduleRow(id, customRoom.ja, customRoom.en)]);
    setActiveRoomId(id);
    setWorkspaceView('room');
    setViewMode('source');
    setPreviewError(undefined);
    setEstimateError(undefined);
  };

  const removeRoom = useCallback((rowId: string) => {
    const remaining = roomTabs.filter((candidate) => candidate.id !== rowId);
    if (!remaining.length) return;
    setRoomTabs(remaining);
    setRoomDrafts((current) => {
      const removed = current[rowId];
      if (removed?.sourcePhotoUrl) URL.revokeObjectURL(removed.sourcePhotoUrl);
      const next = { ...current };
      delete next[rowId];
      return next;
    });
    setFinishScheduleRows((current) => current.filter((row) => row.id !== rowId));
    setActiveRoomId((current) => (current === rowId ? remaining[0].id : current));
  }, [roomTabs]);

  const switchRoom = (roomId: string) => {
    if (previewLoading || estimateLoading) return;
    setActiveRoomId(roomId);
    setWorkspaceView('room');
    const nextDraft = roomDrafts[roomId];
    setViewMode(nextDraft?.previewUrl ? 'preview' : 'source');
    setPreviewError(undefined);
    setEstimateError(undefined);
  };

  const applyFloorplanRooms = (detectedRooms: AppliedFloorplanRoom[]) => {
    if (!detectedRooms.length) return;
    const existingRoomsBySource = new Map(roomTabs.flatMap((roomTab) => {
      const sourceRoomId = floorplanSourceIdFor(roomTab);
      return sourceRoomId ? [[sourceRoomId, roomTab] as const] : [];
    }));
    const nextTabs: RoomTab[] = detectedRooms.map((detectedRoom, index) => {
      const existingRoom = existingRoomsBySource.get(detectedRoom.id);
      return {
        id: existingRoom?.id || `plan-${index + 1}-${detectedRoom.id}`,
        type: detectedRoom.roomType,
        ja: detectedRoom.nameJa,
        en: detectedRoom.nameEn,
        custom: true,
        sourceFloorplanRoomId: detectedRoom.id,
      };
    });

    const keptIds = new Set(nextTabs.map((nextRoom) => nextRoom.id));
    const droppedTabs = roomTabs.filter((roomTab) => !keptIds.has(roomTab.id));
    const droppedWork = droppedTabs.some((roomTab) => {
      const draft = roomDrafts[roomTab.id];
      return Boolean(draft && (draft.sourcePhotoData || draft.previewUrl || draft.accessories.length || draft.surfaceEstimate));
    }) || finishScheduleRows.some((row) => !keptIds.has(row.id) && row.edited?.length);
    if (droppedWork && !window.confirm(t(
      `平面図の部屋で置き換えると、${droppedTabs.length}室の写真・選定・仕上表の編集内容が失われます。続けますか？`,
      `Replacing rooms from the floorplan discards the photos, selections, and schedule edits for ${droppedTabs.length} room(s). Continue?`,
    ))) return;
    if (!droppedWork && renderedRoomCount > 0 && !window.confirm(linkedFloorplanRoomCount
      ? t('平面図の部屋と面積を再同期します。既存の仕上げ選択は保持されます。続けますか？', 'Resync rooms and areas from the floorplan? Existing finish selections will be retained.')
      : t('現在の部屋リストと生成済みプレビューを、平面図から抽出した部屋へ置き換えますか？', 'Replace the current room list and rendered previews with the rooms detected from this floorplan?'))) return;

    droppedTabs.forEach((roomTab) => {
      const url = roomDrafts[roomTab.id]?.sourcePhotoUrl;
      if (url) URL.revokeObjectURL(url);
    });
    const surfaceIds: FloorplanSurface[] = ['floor', 'walls', 'ceiling'];
    const nextDrafts: Record<string, RoomDraft> = Object.fromEntries(nextTabs.map((nextRoom, index) => {
      const detectedRoom = detectedRooms[index];
      const draft = roomDrafts[nextRoom.id] || createRoomDraft();
      const enabledSlots = surfaceIds.filter((surface) => detectedRoom.surfaces[surface]);
      const surfaceEstimate: SurfaceEstimate = {
        floorAreaM2: detectedRoom.floorAreaM2,
        netWallAreaM2: detectedRoom.netWallAreaM2,
        ceilingAreaM2: detectedRoom.ceilingAreaM2,
        roomWidthM: detectedRoom.roomWidthM,
        roomDepthM: detectedRoom.roomDepthM,
        ceilingHeightM: 2.4,
        confidence: detectedRoom.confidence,
        assumptionJa: detectedRoom.assumptionJa,
        assumptionEn: detectedRoom.assumptionEn,
        measurementSource: 'floorplan-ai-reviewed',
        reviewedAt: new Date().toISOString(),
        model: detectedRoom.model,
        promptVersion: detectedRoom.promptVersion,
      };
      return [nextRoom.id, {
        ...draft,
        enabledSlots,
        surfaceEstimate,
        quantities: {
          ...draft.quantities,
          [draft.selections.floor]: detectedRoom.floorAreaM2,
          [draft.selections.walls]: detectedRoom.netWallAreaM2,
          [draft.selections.ceiling]: detectedRoom.ceilingAreaM2,
        },
      }];
    }));
    const nextSchedule = nextTabs.map((nextRoom) => {
      const existingRow = finishScheduleRows.find((row) => row.id === nextRoom.id);
      const row = existingRow
        ? { ...existingRow, room: { ja: nextRoom.ja, en: nextRoom.en } }
        : blankFinishScheduleRow(nextRoom.id, nextRoom.ja, nextRoom.en);
      return withSchedulePatch(row, finishSchedulePatch(nextDrafts[nextRoom.id], nextRoom.type));
    });

    setRoomTabs(nextTabs);
    setRoomDrafts(nextDrafts);
    setFinishScheduleRows(nextSchedule);
    setActiveRoomId(nextTabs[0].id);
    setWorkspaceView('room');
    setViewMode('source');
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
    if (usesFloorplanTakeoff) return;
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
      const previewItems = selectedItems.map((item) => ({
        section: item.section,
        name: item.nameEn,
        specification: item.specificationEn,
        color: item.colorEn,
        code: item.productCode,
        status: statusLabel(item.status, 'en'),
        exactProductConfirmed: item.exactProductConfirmed,
      }));
      const response = await fetch('/api/generate-interior-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePhoto: sourcePhotoData,
          room: room.en,
          style: designStyle.en,
          note: requestNote,
          language,
          items: previewItems,
        }),
      });
      const payload = await readJsonResponse(response);
      if (!response.ok || !payload.image) throw new Error(payload.error || 'Preview generation failed');
      const renderedAt = new Date().toISOString();
      let verification: PreviewVerification;
      try {
        const [auditSource, auditRender] = await Promise.all([
          prepareImage(sourcePhotoData, { maxEdge: 1280, jpegQuality: 0.85, maxLength: MAX_PAIRED_IMAGE_LENGTH }),
          prepareImage(payload.image, { maxEdge: 1280, jpegQuality: 0.85, maxLength: MAX_PAIRED_IMAGE_LENGTH }),
        ]);
        const verificationResponse = await fetch('/api/verify-interior-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourcePhoto: auditSource,
            renderedImage: auditRender,
            items: previewItems.map((item) => `${item.name} — ${item.color}; ${item.specification}`),
          }),
        });
        const verificationPayload = await readJsonResponse(verificationResponse);
        if (!verificationResponse.ok || !verificationPayload.verification) throw new Error(verificationPayload.error || 'Preview verification failed');
        verification = verificationPayload.verification as PreviewVerification;
      } catch (verificationError) {
        verification = {
          status: 'review', structureScore: 0, scheduleScore: 0, structurePreserved: false, selectedItemsPresent: false,
          issues: [verificationError instanceof Error ? verificationError.message : 'Automatic verification was unavailable.'], missingItems: [], unexpectedChanges: [],
          verifierType: 'verification-unavailable-requires-human-review',
        };
      }
      updateActiveDraft({
        previewUrl: payload.image,
        previewStale: false,
        previewVerification: verification,
        previewApprovedAt: undefined,
        renderedAt,
        renderMetadata: { model: payload.model, promptVersion: payload.promptVersion, generatedAt: renderedAt },
      });
      setViewMode('preview');
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : t('AIプレビューの生成に失敗しました。', 'AI preview generation failed.'));
    } finally {
      setPreviewLoading(false);
    }
  };

  const approvePreview = () => {
    if (!previewVerification || previewVerification.status === 'fail') return;
    updateActiveDraft({ previewApprovedAt: new Date().toISOString() });
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
    const preview = previewUrl && previewApprovedAt ? `<img class="preview" src="${previewUrl}" alt="Human-reviewed AI interior preview">` : previewUrl ? `<div class="preview empty">${t('AIプレビューは未承認のため提案書から除外', 'AI preview omitted because human approval is pending')}</div>` : `<div class="preview empty">${t('AIプレビュー未生成', 'AI preview not generated')}</div>`;
    const measurementSummary = surfaceEstimate
      ? `<div class="measurement"><strong>${t('写真からのAI面積概算', 'AI photo-based area estimate')}</strong><span>${t('床', 'Floor')} ${surfaceEstimate.floorAreaM2} m² · ${t('壁（開口控除）', 'Walls (net)')} ${surfaceEstimate.netWallAreaM2} m² · ${t('天井', 'Ceiling')} ${surfaceEstimate.ceilingAreaM2} m²</span><small>${escapeHtml(language === 'ja' ? surfaceEstimate.assumptionJa : surfaceEstimate.assumptionEn)}</small></div>`
      : '';
    const finishScheduleHtml = finishScheduleRows.map((row) => `<tr>${(['room', 'floor', 'baseboard', 'dado', 'wall', 'ceiling', 'remarks'] as FinishScheduleField[]).map((field) => `<td>${escapeHtml(scheduleText(row[field], language)).replaceAll('\n', '<br>')}</td>`).join('')}</tr>`).join('');
    const pricingNote = unpricedCount
      ? t(`未入力単価 ${unpricedCount}件は合計に含まれていません。`, `${unpricedCount} unpriced item(s) are excluded from totals.`)
      : t('全選定品に単価が入力されています。', 'All selected items have entered prices.');
    return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(projectName)} ${t('内部仕上表', 'Interior Finish Schedule')}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700&family=Chivo+Mono:wght@400;500&family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap"><style>body{margin:0;background:#f7f8fa;color:#1c1e21;font-family:'Inter','Noto Sans JP',system-ui,sans-serif;font-size:13px;line-height:1.5}.page{max-width:1280px;margin:32px auto;background:#fff;border:1px solid #e5e7eb;padding:48px}.top{display:flex;justify-content:space-between;gap:32px;border-bottom:1px solid #e5e7eb;padding-bottom:24px}.eyebrow{font-size:10px;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:#9ca3af}.eyebrow::after{content:"";display:block;width:48px;height:2px;margin-top:8px;background:#1f4cda}h1{margin:16px 0 8px;font-family:'Archivo','Noto Sans JP',system-ui,sans-serif;font-size:32px;font-weight:700;letter-spacing:-.03em}.meta{font-size:12px;color:#6b7280}.summary{text-align:right}.summary strong{font-size:13px;font-weight:600}.preview{display:block;width:100%;max-height:600px;object-fit:contain;margin:32px 0;border:1px solid #e5e7eb;background:#f5f6fa}.preview.empty{height:280px;display:grid;place-items:center;color:#9ca3af;font-size:12px}.measurement{display:flex;gap:16px;align-items:baseline;padding:14px 16px;background:#eef3fd;border-left:2px solid #1f4cda;font-size:12px}.measurement strong{font-weight:600}.measurement span{font-family:'Chivo Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}.measurement small{margin-left:auto;color:#6b7280}h2{margin:32px 0 12px;font-family:'Archivo','Noto Sans JP',system-ui,sans-serif;font-size:20px;font-weight:700;letter-spacing:-.03em}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#fff;text-align:left;padding:10px 8px;border-bottom:1px solid #e5e7eb;color:#9ca3af;font-size:10px;font-weight:600;letter-spacing:.15em;text-transform:uppercase}td{padding:10px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top}td small{display:block;color:#6b7280;margin-top:4px}.finish-grid{table-layout:fixed;border:1px solid #1c1e21}.finish-grid th,.finish-grid td{border:1px solid #1c1e21;padding:7px 8px;vertical-align:top;white-space:normal}.finish-grid th{color:#1c1e21;background:#f5f6fa;letter-spacing:.04em;text-transform:none}.finish-grid th:first-child,.finish-grid td:first-child{width:12%}.finish-grid th:last-child,.finish-grid td:last-child{width:17%}.status{font-weight:600;color:#1f4cda}.swatch{display:block;width:36px;height:30px;border:1px solid #e5e7eb}.num{text-align:right;font-family:'Chivo Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}.totals{width:380px;margin:24px 0 0 auto}.totals div{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb}.totals strong{font-family:'Chivo Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;font-weight:500}.totals .grand{font-size:18px;border-top:1px solid #1c1e21;border-bottom:0;margin-top:6px;padding-top:12px}.totals .grand strong{color:#1f4cda;font-weight:600}.pricing{color:#1f4cda;font-size:11px;text-align:right;margin-top:10px}.note{margin-top:32px;padding:14px 16px;background:#f5f6fa;font-size:11px;color:#6b7280}a{color:#1f4cda;text-decoration:none}@media print{body{background:#fff}.page{margin:0;max-width:none;border:0;padding:16px}.preview{max-height:350px}.finish-grid{font-size:9px}}</style></head><body><main class="page"><header class="top"><div><div class="eyebrow">ArchiX · Interior Proposal POC</div><h1>${escapeHtml(projectName)}</h1><div class="meta">${escapeHtml(customerName)} · ${escapeHtml(designStyle[language === 'ja' ? 'ja' : 'en'])}</div></div><div class="summary"><strong>${t('内部仕上表', 'Interior Finish Schedule')}</strong><div class="meta">${generatedAt}</div></div></header>${preview}${measurementSummary}<h2>${t('内部仕上表', 'Interior Finish Schedule')}</h2><table class="finish-grid"><thead><tr><th>${t('室名', 'Room')}</th><th>${t('床', 'Floor')}</th><th>${t('巾木', 'Baseboard')}</th><th>${t('腰', 'Wainscot')}</th><th>${t('壁', 'Wall')}</th><th>${t('天井', 'Ceiling')}</th><th>${t('備考', 'Remarks')}</th></tr></thead><tbody>${finishScheduleHtml}</tbody></table><h2>${t('見積明細', 'Estimate Details')}</h2><table><thead><tr><th>${t('画像', 'Image')}</th><th>${t('区分・状態', 'Section / status')}</th><th>${t('品名・仕様', 'Description / specification')}</th><th>${t('サイズ', 'Size')}</th><th>${t('色・品番', 'Color / code')}</th><th>${t('メーカー・出典', 'Maker / source')}</th><th>${t('数量', 'Qty')}</th><th>${t('単位', 'Unit')}</th><th>${t('単価', 'Unit price')}</th><th>${t('金額', 'Amount')}</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div><span>${t('小計', 'Subtotal')}</span><strong>${currency(subtotal, language)}</strong></div><div><span>${t('消費税 10%', 'Tax 10%')}</span><strong>${currency(tax, language)}</strong></div><div class="grand"><span>${t('合計', 'Total')}</span><strong>${currency(total, language)}</strong></div></div><div class="pricing">${escapeHtml(pricingNote)}</div><div class="note">${t('本書の品番・単価・家具はブランドを使用しないPOCサンプルです。写真からの面積はAI概算であり、正式見積・発注前に現場採寸と実商品データへ置き換えてください。AI画像は完成イメージであり、製品外観を保証しません。', 'SKUs, prices, and furniture in this document are unbranded POC samples. Photo-derived areas are AI estimates; replace them with site measurements and real product data before formal estimating or ordering. AI imagery is conceptual and does not guarantee exact product appearance.')}</div></main></body></html>`;
  };

  const exportCsv = () => {
    const header = language === 'ja'
      ? ['室名', '床', '巾木', '腰', '壁', '天井', '備考']
      : ['Room', 'Floor', 'Baseboard', 'Wainscot', 'Wall', 'Ceiling', 'Remarks'];
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
    if (popup.document.readyState === 'complete') popup.print();
    else popup.addEventListener('load', () => popup.print(), { once: true });
  };

  const surfaceSlotDefinitions = activeSlotDefinitions.filter((slot) => ['floor', 'walls', 'ceiling', 'backsplash'].includes(slot.id));
  const fixtureSlotDefinitions = activeSlotDefinitions.filter((slot) => !['floor', 'walls', 'ceiling', 'backsplash'].includes(slot.id));
  const renderSlotCards = (definitions: typeof activeSlotDefinitions) => definitions.map((slot) => {
    const item = catalogItem(selections[slot.id]) || CATALOG_BY_SLOT.get(slot.id)?.[0];
    const checked = enabledSlots.includes(slot.id);
    if (!item) return null;
    return <div className={`change-check ${checked ? 'checked' : ''}`} key={slot.id}>
      <label><input type="checkbox" checked={checked} onChange={() => toggleSlot(slot.id)} /><span className="check-mark">✓</span><span className="mini-swatch" style={{ background: item.swatch }} /><span className="change-copy"><strong>{language === 'ja' ? slot.labelJa : slot.labelEn}</strong><small>{itemName(item, language)} · {itemColor(item, language)}</small></span></label>
      <select value={item.id} disabled={!checked} onChange={(event) => updateSelection(slot.id, event.target.value)}>{(CATALOG_BY_SLOT.get(slot.id) || []).map((option) => <option key={option.id} value={option.id}>{itemName(option, language)} · {itemColor(option, language)}</option>)}</select>
    </div>;
  });
  const activeSummaryColumns = FINISH_SCHEDULE_COLUMNS.filter((column) => column.field !== 'room');
  const surfaceFigures = displayedSurfaceEstimate && <>
    <div><span>{t('床', 'Floor')}</span><strong>{displayedSurfaceEstimate.floorAreaM2} m²</strong></div>
    <div><span>{t('壁（開口控除）', 'Walls (net)')}</span><strong>{displayedSurfaceEstimate.netWallAreaM2} m²</strong></div>
    <div><span>{t('天井', 'Ceiling')}</span><strong>{displayedSurfaceEstimate.ceilingAreaM2} m²</strong></div>
    <p><b>{displayedSurfaceEstimate.roomWidthM} × {displayedSurfaceEstimate.roomDepthM} × H{displayedSurfaceEstimate.ceilingHeightM} m</b><span>{t('信頼度', 'Confidence')}: {displayedSurfaceEstimate.confidence === 'high' ? t('高', 'High') : displayedSurfaceEstimate.confidence === 'medium' ? t('中', 'Medium') : t('低', 'Low')}</span><small>{language === 'ja' ? displayedSurfaceEstimate.assumptionJa : displayedSurfaceEstimate.assumptionEn}</small>{Boolean(displayedSurfaceEstimate.validationIssues?.length) && <em>⚠ {t(`${displayedSurfaceEstimate.validationIssues?.length}件の整合性警告`, `${displayedSurfaceEstimate.validationIssues?.length} validation warning(s)`)}</em>}</p>
  </>;

  return (
    <div className="studio-app">
      <header className="studio-header">
        <a href="#studio" className="studio-brand"><strong>Archi<span>X</span></strong><small>Interior Proposal POC</small></a>
        <div className="studio-header-actions"><span className={`project-save-state ${saveState}`}>{saveState === 'saving' ? t('保存中…', 'Saving…') : saveState === 'unavailable' ? t('このブラウザでは保存不可', 'Local save unavailable') : `✓ ${t('ローカル保存済み', 'Saved locally')}${savedAt ? ` · ${new Intl.DateTimeFormat(language === 'ja' ? 'ja-JP' : 'en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date(savedAt))}` : ''}`}</span><div className="language-toggle" role="group" aria-label="Language"><button className={language === 'ja' ? 'active' : ''} onClick={() => setLanguage('ja')}>日本語</button><button className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button></div></div>
      </header>

      <main id="studio" className="studio-main">
        <section className="studio-title">
          <div>
            <span>Room Finish Studio</span>
            {workspaceView === 'floorplan'
              ? language === 'ja'
                ? <h1>平面図から、<span>部屋と仕上げ面積</span>をつくる。</h1>
                : <h1>Turn a floorplan into <span>rooms and finish areas.</span></h1>
              : language === 'ja'
                ? <h1>写真を見ながら、<span>仕上げ</span>と参考家具を選ぶ。</h1>
                : <h1>Choose <span>finishes</span> and reference furniture while viewing the room.</h1>}
          </div>
          <div className="live-count"><i />{t('仕上げ表', 'Schedule')} · {renderedRoomCount}/{roomTabs.length} {t('室レンダー済み', 'rooms rendered')}</div>
        </section>

        <nav className="room-tabs" aria-label={t('部屋を選択', 'Choose a room')}>
          <div className="room-tabs-scroll" role="tablist">
            <div className={`room-tab-shell floorplan-tab-shell ${workspaceView === 'floorplan' ? 'active' : ''}`}>
              <button role="tab" aria-selected={workspaceView === 'floorplan'} className="room-tab floorplan-tab" disabled={previewLoading || estimateLoading} onClick={() => setWorkspaceView('floorplan')}>
                <span className={`room-status-dot ${linkedFloorplanRoomCount ? 'rendered' : ''}`} aria-hidden="true" />
                <span><strong>{t('平面図', 'Floorplan')}</strong><small>{linkedFloorplanRoomCount ? t(`プロジェクト基準 · ${linkedFloorplanRoomCount}室連携`, `Project basis · ${linkedFloorplanRoomCount} rooms linked`) : t('任意 · 部屋と面積を抽出', 'Optional · detect rooms & areas')}</small></span>
              </button>
            </div>
            {roomTabs.map((roomTab) => {
              const draft = roomDrafts[roomTab.id];
              const isRendering = previewLoading && roomTab.id === activeRoomId;
              const isEstimating = estimateLoading && roomTab.id === activeRoomId;
              const status = isRendering ? 'rendering' : isEstimating ? 'estimating' : draft?.previewUrl && (draft.previewStale || !draft.previewApprovedAt) ? 'pending' : draft?.previewUrl ? 'rendered' : 'not-rendered';
              const statusCopy = status === 'rendering' ? t('生成・検証中', 'Rendering & checking') : status === 'estimating' ? t('面積候補を推定中', 'Estimating suggestion') : status === 'pending' ? draft?.previewStale ? t('変更あり', 'Changes pending') : t('人の確認待ち', 'Human review required') : status === 'rendered' ? t('確認済み', 'Approved') : t('未生成', 'Not rendered');
              return <div key={roomTab.id} className={`room-tab-shell ${workspaceView === 'room' && roomTab.id === activeRoomId ? 'active' : ''}`}>
                <button role="tab" aria-selected={workspaceView === 'room' && roomTab.id === activeRoomId} className="room-tab" disabled={previewLoading || estimateLoading} onClick={() => switchRoom(roomTab.id)}>
                  <span className={`room-status-dot ${status}`} aria-hidden="true" />
                  <span><strong>{roomTab[language]}</strong><small>{statusCopy}</small></span>
                </button>
                {roomTab.custom && roomTabs.length > 1 && <button className="remove-room-tab" disabled={previewLoading || estimateLoading} aria-label={t('部屋を削除', 'Remove room')} onClick={() => removeRoom(roomTab.id)}>×</button>}
              </div>;
            })}
          </div>
          <button className="add-room-tab" disabled={previewLoading || estimateLoading} onClick={addRoom}>＋ {t('部屋を追加', 'Add room')}</button>
        </nav>

        <section className="quick-fields" aria-label={t('案件情報', 'Project details')}>
          <label><span>{t('案件名', 'Project')}</span><input value={projectName} onChange={(event) => setProjectName(event.target.value)} /></label>
          <label><span>{t('顧客', 'Customer')}</span><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></label>
          {workspaceView === 'room' && room.custom && <label><span>{t('部屋名', 'Room name')}</span><input value={room[language]} onChange={(event) => renameActiveRoom(event.target.value)} /></label>}
          {workspaceView === 'room' && <label><span>{t('スタイル', 'Style')}</span><select value={style} onChange={(event) => updateActiveDraft({ style: event.target.value, previewStale: Boolean(previewUrl), previewVerification: undefined, previewApprovedAt: undefined })}>{STYLE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option[language === 'ja' ? 'ja' : 'en']}</option>)}</select></label>}
          {workspaceView === 'room' && <label className="brief-field"><span>{t('要望', 'Brief')}</span><input value={requestNote} onChange={(event) => updateActiveDraft({ requestNote: event.target.value, previewStale: Boolean(previewUrl), previewVerification: undefined, previewApprovedAt: undefined })} /></label>}
        </section>

        <div className={`workspace-pane ${workspaceView === 'floorplan' ? '' : 'is-inactive'}`} aria-hidden={workspaceView !== 'floorplan'}>
          <FloorplanWorkspace
            language={language}
            onApplyRooms={applyFloorplanRooms}
            floorFinishes={floorFinishPreviews}
            linkedRoomIds={linkedFloorplanRoomIds}
            onOpenRoom={switchRoom}
          />
        </div>
        {workspaceView === 'room' && <>
        <section className="studio-workspace">
          <div className="visual-panel">
            <div className="visual-toolbar">
              <div className="view-tabs" role="tablist">
                <button className={viewMode === 'source' ? 'active' : ''} onClick={() => setViewMode('source')} disabled={!sourcePhotoUrl}>{t('元の写真', 'Original')}</button>
                <button className={viewMode === 'preview' ? 'active' : ''} onClick={() => setViewMode('preview')} disabled={!previewUrl}>{t('変更後', 'Preview')}</button>
              </div>
              <div className="visual-tools">
                <span className={`render-state ${previewApprovedAt && !previewStale ? 'ready' : ''}`}>{previewLoading ? t('生成・検証中…', 'Rendering and checking…') : previewStale ? t('変更あり · 再生成が必要', 'Changes pending · render again') : previewApprovedAt ? t('確認済みプレビュー', 'Human-approved preview') : previewUrl ? t('人の確認待ち', 'Awaiting human review') : t('未生成', 'Not rendered')}</span>
                <button className="change-photo" disabled={estimateLoading || previewLoading} onClick={() => fileInputRef.current?.click()}>{sourcePhotoUrl ? t('写真を変更', 'Change photo') : t('写真を選択', 'Choose photo')}</button>
              </div>
            </div>

            {usesFloorplanTakeoff
              ? <section className="surface-estimator takeoff-basis" aria-label={t('平面図からの数量', 'Quantities from the floorplan')}>
                <div className="estimate-intro"><span>FLOORPLAN TAKEOFF</span><strong>{t('平面図の数量を使用中', 'Using floorplan quantities')}</strong><small>{t('この部屋は平面図から作成されているため、写真からの面積推定は行いません。数量の変更は平面図で行ってください。', 'This room comes from the floorplan, so no photo area estimate is run. Change quantities in the floorplan instead.')}</small></div>
                {surfaceFigures && <div className="estimate-result reviewed">{surfaceFigures}</div>}
                <button className="estimate-basis-link" onClick={() => setWorkspaceView('floorplan')}>{t('平面図を開く', 'Open the floorplan')} →</button>
              </section>
              : <section className="surface-estimator" aria-label={t('面積の自動推定', 'Automatic surface estimate')}>
                <div className="estimate-intro"><span>AI AREA SUGGESTION</span><strong>{estimateLoading ? t('写真から面積候補を推定中…', 'Estimating an area suggestion…') : surfaceEstimateSuggestion ? t('AI候補を確認してください', 'Review the AI suggestion') : surfaceEstimate ? t('確認済み数量を使用中', 'Using reviewed quantities') : t('写真アップロード時に候補を作成', 'Suggestion generated on upload')}</strong><small>{surfaceEstimateSuggestion ? t('この候補はまだ数量・金額へ反映されていません。', 'This suggestion is not yet used in quantities or totals.') : t('AI候補は確認して承認するまで見積へ反映されません。', 'AI suggestions do not affect estimates until explicitly approved.')}</small></div>
                <label className="height-input"><span>{t('想定天井高', 'Assumed height')}</span><div><input type="number" min="2" max="5" step="0.1" value={assumedCeilingHeight} onChange={(event) => updateActiveDraft({ assumedCeilingHeight: Number(event.target.value) || 2.4 })} /><em>m</em></div></label>
                <button className="estimate-button" disabled={!sourcePhotoData || estimateLoading} onClick={estimateSurfaces}>{estimateLoading ? t('推定中…', 'Estimating…') : displayedSurfaceEstimate ? t('別の候補を推定', 'Generate another suggestion') : t('候補を推定', 'Estimate suggestion')}</button>
                {surfaceFigures && <div className={`estimate-result ${surfaceEstimateSuggestion ? 'pending-review' : 'reviewed'}`}>
                  {surfaceFigures}
                  {surfaceEstimateSuggestion && <div className="estimate-review-actions"><button onClick={discardSurfaceEstimate}>{t('破棄', 'Discard')}</button><button className="approve" onClick={acceptSurfaceEstimate}>{t('確認して数量へ反映', 'Approve and use quantities')}</button></div>}
                </div>}
                {estimateError && <div className="estimate-error">{estimateError}</div>}
              </section>}

            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" hidden onChange={(event) => loadSourcePhoto(event.target.files?.[0])} />
            <div className={`visual-stage ${dragActive ? 'dragging' : ''} ${!sourcePhotoUrl ? 'empty' : ''}`} onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragActive(false)} onDrop={(event) => { event.preventDefault(); setDragActive(false); loadSourcePhoto(event.dataTransfer.files[0]); }} onClick={() => { if (!sourcePhotoUrl) fileInputRef.current?.click(); }} role={!sourcePhotoUrl ? 'button' : undefined} tabIndex={!sourcePhotoUrl ? 0 : undefined} onKeyDown={(event) => { if (!sourcePhotoUrl && event.key === 'Enter') fileInputRef.current?.click(); }}>
              {previewLoading ? <div className="rendering-message"><span className="studio-spinner" /><strong>{t('選んだ変更を反映しています', 'Applying your selected changes')}</strong><small>{t('30〜90秒ほどかかります', 'Usually 30–90 seconds')}</small></div>
                : viewMode === 'preview' && previewUrl ? <><img src={previewUrl} alt={t('変更後の室内', 'Updated room')} />{previewStale && <span className="stale-chip">{t('選択が変わりました · もう一度生成してください', 'Selections changed · render again')}</span>}{previewVerification && !previewStale && <span className={`verification-chip ${previewVerification.status}`}>{previewApprovedAt ? `✓ ${t('人が確認済み', 'Human approved')}` : previewVerification.status === 'pass' ? t('自動検証合格 · 人の確認待ち', 'Automated check passed · human review required') : previewVerification.status === 'fail' ? t('構造変更の可能性 · 再生成推奨', 'Possible structural changes · regenerate') : t('要確認 · 人の確認が必要', 'Review required · human approval needed')}</span>}</>
                  : sourcePhotoUrl ? <img src={sourcePhotoUrl} alt={t('元の室内写真', 'Original room')} />
                    : <div className="upload-message"><span>＋</span><strong>{room[language]} · {t('写真をアップロード', 'Upload a photo')}</strong><small>PNG / JPEG · {usesFloorplanTakeoff ? t('最大12MB · 数量は平面図から取得済み', '12 MB max · quantities already taken from the floorplan') : t('最大12MB · 面積は自動推定されます', '12 MB max · areas estimated automatically')}</small></div>}
            </div>

            {previewError && <div className="render-error"><strong>{t('生成できませんでした', 'Could not generate')}</strong><span>{previewError}</span></div>}
            {previewVerification && previewUrl && !previewStale && <div className={`preview-verification-panel ${previewVerification.status}`}><div><span>AI OUTPUT AUDIT</span><strong>{t(`構造 ${previewVerification.structureScore} / 仕上げ ${previewVerification.scheduleScore}`, `Structure ${previewVerification.structureScore} / schedule ${previewVerification.scheduleScore}`)}</strong><small>{previewVerification.issues[0] || t('自動検証は補助情報です。元写真と選定内容を目視確認してください。', 'Automated verification is advisory; compare the source and schedule visually.')}</small></div>{!previewApprovedAt && previewVerification.status !== 'fail' && <button onClick={approvePreview}>{t('元写真と選定内容を確認して承認', 'I compared and approve this preview')}</button>}</div>}
            <div className="render-bar">
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
                {ACCESSORY_CATALOG.map((item) => {
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
              <span className="summary-status rendered">✓ {t('仕上表へ反映済み', 'Schedule updated')}{previewStale ? ` · ${t('プレビュー更新待ち', 'preview pending')}` : ''}</span>
              <button onClick={() => { setScheduleView('finishes'); setScheduleExpanded(true); }}>{t('仕上表をすべて表示', 'View complete schedule')} →</button>
            </div>
          </header>
          <div className="active-finish-grid">
            {activeSummaryColumns.map((column) => <div key={column.field}><span>{language === 'ja' ? column.ja : column.en}</span><strong>{activeScheduleRow && scheduleText(activeScheduleRow[column.field], language) ? scheduleText(activeScheduleRow[column.field], language) : '—'}</strong></div>)}
          </div>
          <p>{t('材料の選択は仕上表とプロジェクト集計へ即時反映されます。AIプレビューの生成は任意です。', 'Material selections update the finish schedule and project totals immediately. Generating an AI preview is optional.')}</p>
        </section>
        </>}

        {workspaceView === 'room' && scheduleExpanded && <section className="schedule-panel">
          <div className="schedule-heading">
            <div><span><i /> LIVE</span><h2>{t('内部仕上表', 'Interior Finish Schedule')}</h2><p>{t('部屋ごとに床・巾木・腰・壁・天井・備考を整理します', 'Organize floor, baseboard, wainscot, wall, ceiling, and remarks by room')}</p></div>
            <div className="export-actions"><button onClick={() => setScheduleExpanded(false)}>{t('閉じる', 'Hide')}</button><button onClick={exportCsv}>{t('仕上表 CSV', 'Schedule CSV')}</button><button onClick={printProposal}>{t('印刷 / PDF', 'Print / PDF')}</button><button className="primary" onClick={exportProposal}>{t('提案書を出力', 'Export proposal')}</button></div>
          </div>
          <div className="schedule-view-tabs" role="tablist" aria-label={t('仕上表表示', 'Schedule view')}>
            <button className={scheduleView === 'finishes' ? 'active' : ''} onClick={() => setScheduleView('finishes')}>{t('内部仕上表', 'Finish schedule')}</button>
            <button className={scheduleView === 'estimate' ? 'active' : ''} onClick={() => setScheduleView('estimate')}>{t('現在の部屋', 'Current room')} <span>{selectedItems.length}</span></button>
            <button className={scheduleView === 'project' ? 'active' : ''} onClick={() => setScheduleView('project')}>{t('プロジェクト集計', 'Project summary')} <span>{projectLines.length}</span></button>
          </div>

          {scheduleView === 'finishes' ? <>
            <div className="finish-sheet-title"><strong>{t('内 部 仕 上 表', 'INTERIOR FINISH SCHEDULE')}</strong><span>{t('選択内容を自動反映', 'Selections update automatically')} · {roomTabs.length} {t('室', 'rooms')}</span></div>
            <div className="finish-matrix-wrap"><table className="finish-matrix"><thead><tr>{FINISH_SCHEDULE_COLUMNS.map((column) => <th key={column.field}>{language === 'ja' ? column.ja : column.en}</th>)}</tr></thead><tbody>
              {finishScheduleRows.map((row) => <ScheduleRow
                key={row.id}
                row={row}
                columns={FINISH_SCHEDULE_COLUMNS}
                language={language}
                isActive={row.id === activeScheduleRoomId}
                canRemove={roomTabs.length > 1 && Boolean(roomTabs.find((tab) => tab.id === row.id)?.custom)}
                renderedLabel={roomDrafts[row.id]?.previewUrl && !roomDrafts[row.id]?.previewStale ? ` · ${t('生成済み', 'rendered')}` : ''}
                onChangeCell={updateFinishScheduleCell}
                onRestoreCell={restoreDerivedScheduleCell}
                onRemoveRoom={removeRoom}
                removeLabel={t('部屋を削除', 'Remove room')}
                restoreLabel={t('選択内容から自動更新に戻す', 'Restore automatic value from selections')}
                liveLabel={t('選択反映中', 'Selections live')}
              />)}
            </tbody></table></div>
            <div className="finish-sheet-footer"><button onClick={addRoom}>＋ {t('部屋を追加', 'Add room')}</button><p>{t('材料を選ぶと仕上表へ即時反映されます。青い行が現在編集中の部屋です。各セルは直接編集できます。', 'Material choices appear here immediately. The blue row is the room currently being edited; every cell remains directly editable.')}</p></div>
          </> : scheduleView === 'estimate' ? <>
            <div className="schedule-table-wrap"><table className="schedule-table"><thead><tr><th>{t('選定品', 'Selected item')}</th><th>{t('区分・状態', 'Type / status')}</th><th>{t('色・品番', 'Color / code')}</th><th>{t('メーカー・出典', 'Maker / source')}</th><th>{t('数量', 'Qty')}</th><th>{t('単価', 'Unit price')}</th><th>{t('金額', 'Amount')}</th></tr></thead><tbody>
              {selectedItems.length ? selectedItems.map((item) => {
                const quantity = getQuantity(item); const unitPrice = getUnitPrice(item);
                const isAiQuantity = Boolean(surfaceEstimate && item.slot && ['floor', 'walls', 'ceiling'].includes(item.slot));
                return <tr key={item.id}><td><div className="schedule-item"><span style={{ background: item.swatch }} /><div><strong>{itemName(item, language)}</strong><small>{itemSpecification(item, language)} · {item.size}</small></div></div></td><td><span className={`type-pill ${item.section}`}>{SECTION_LABELS[item.section][language]}</span><span className={`status-pill ${item.status}`}>{statusLabel(item.status, language)}</span></td><td>{itemColor(item, language)}<code>{item.productCode || t('品番要確認', 'SKU to confirm')}</code></td><td><span className="maker-name">{itemManufacturer(item, language)}</span>{item.sourceUrl ? <a className="source-link" href={item.sourceUrl} target="_blank" rel="noreferrer">{itemSource(item, language)} ↗</a> : <small>{itemSource(item, language)}</small>}</td><td><div className="qty-control"><input type="number" min="0" step="0.1" value={quantity} onChange={(event) => updateActiveDraft((current) => ({ quantities: { ...current.quantities, [item.id]: Number(event.target.value) } }))} /><span>{itemUnit(item, language)}</span>{isAiQuantity && <small>{t('AI概算', 'AI est.')}</small>}</div></td><td><input className={`unit-price ${unitPrice === undefined ? 'unpriced' : ''}`} aria-label={`${itemName(item, language)} ${t('単価', 'unit price')}`} type="number" min="0" step="100" value={unitPrice ?? ''} placeholder={t('見積', 'Quote')} onChange={(event) => updatePrice(item.id, event.target.value)} /></td><td className="line-total">{unitPrice === undefined ? '—' : currency(quantity * unitPrice, language)}</td></tr>;
              }) : <tr><td colSpan={7} className="empty-schedule">{t('右側のチェックボックスから反映する項目を選んでください。', 'Choose items from the checklist to build the estimate.')}</td></tr>}
            </tbody></table></div>
            <div className="schedule-footer"><p>{t('見積明細は仕上表とは分けて管理します。数量・単価はPOC用で、正式見積前に確認してください。', 'Estimate details are kept separate from the finish schedule. Quantities and prices are POC values and require confirmation before formal estimating.')}{unpricedCount > 0 && <strong className="pricing-warning"> {t(`未入力単価 ${unpricedCount}件は合計に含まれません。`, `${unpricedCount} unpriced item(s) are excluded from totals.`)}</strong>}</p><div className="schedule-totals"><span>{t('小計', 'Subtotal')} <strong>{currency(subtotal, language)}</strong></span><span>{t('消費税', 'Tax')} <strong>{currency(tax, language)}</strong></span><span className="total">{t('合計', 'Total')} <strong>{currency(total, language)}</strong></span></div></div>
          </> : <>
            <div className="project-summary-strip"><div><span>{t('対象室', 'Rooms')}</span><strong>{roomTabs.length}</strong></div><div><span>{t('選定品', 'Unique items')}</span><strong>{projectLines.length}</strong></div><div><span>{t('未入力単価', 'Unpriced')}</span><strong>{projectUnpricedCount}</strong></div><div className="grand"><span>{t('税込合計', 'Total incl. tax')}</span><strong>{currency(projectTotal, language)}</strong></div></div>
            <div className="schedule-table-wrap"><table className="schedule-table project-summary-table"><thead><tr><th>{t('選定品', 'Selected item')}</th><th>{t('使用室', 'Rooms')}</th><th>{t('合計数量', 'Total qty')}</th><th>{t('単価', 'Unit price')}</th><th>{t('金額', 'Amount')}</th></tr></thead><tbody>
              {projectLines.map((line) => {
                const unitPrice = priceOverrides[line.item.id] ?? line.item.unitPrice;
                return <tr key={line.item.id}><td><div className="schedule-item"><span style={{ background: line.item.swatch }} /><div><strong>{itemName(line.item, language)}</strong><small>{itemColor(line.item, language)} · {line.item.productCode || t('品番要確認', 'SKU to confirm')}</small></div></div></td><td><div className="room-chip-list">{line.rooms.map((roomName, index) => <span key={`${roomName}-${index}`}>{roomName}</span>)}</div></td><td><strong className="project-quantity">{Math.round(line.quantity * 10) / 10} {itemUnit(line.item, language)}</strong></td><td><input className={`unit-price ${unitPrice === undefined ? 'unpriced' : ''}`} aria-label={`${itemName(line.item, language)} ${t('単価', 'unit price')}`} type="number" min="0" step="100" value={unitPrice ?? ''} placeholder={t('見積', 'Quote')} onChange={(event) => updatePrice(line.item.id, event.target.value)} /></td><td className="line-total">{unitPrice === undefined ? '—' : currency(line.quantity * unitPrice, language)}</td></tr>;
              })}
            </tbody></table></div>
            <div className="schedule-footer"><p>{t('全室の同一材料を集約したプロジェクト数量です。正式発注前に施工ロス率と梱包単位を加えてください。', 'Identical materials are aggregated across all rooms. Add waste factors and package rounding before ordering.')}{projectUnpricedCount > 0 && <strong className="pricing-warning"> {t(`未入力単価 ${projectUnpricedCount}件は合計に含まれません。`, `${projectUnpricedCount} unpriced item(s) are excluded from totals.`)}</strong>}</p><div className="schedule-totals"><span>{t('小計', 'Subtotal')} <strong>{currency(projectSubtotal, language)}</strong></span><span>{t('消費税', 'Tax')} <strong>{currency(projectTax, language)}</strong></span><span className="total">{t('合計', 'Total')} <strong>{currency(projectTotal, language)}</strong></span></div></div>
          </>}
        </section>}
      </main>
    </div>
  );
}
