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
import '../../styles/archix.css';
import './InteriorProposalApp.css';

const ROOM_TYPES = [
  { id: 'ldk', ja: 'LDK・キッチン', en: 'Living / Dining / Kitchen' },
  { id: 'living', ja: 'リビング', en: 'Living room' },
  { id: 'kitchen', ja: 'キッチン', en: 'Kitchen' },
  { id: 'bedroom', ja: '洋室・寝室', en: 'Bedroom' },
  { id: 'japanese', ja: '和室', en: 'Japanese room' },
  { id: 'washroom', ja: '洗面・浴室', en: 'Washroom / Bathroom' },
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

const DEFAULT_SLOT_QUANTITY: Record<SelectionSlot, number> = {
  floor: 42, walls: 118, ceiling: 42, counter: 1, cabinet: 1, backsplash: 1, faucet: 1, sink: 1, hardware: 12, lighting: 3,
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
  const [roomType, setRoomType] = useState('ldk');
  const [style, setStyle] = useState('japandi');
  const [requestNote, setRequestNote] = useState('明るく落ち着いた空間。生活感を抑え、家族が過ごしやすいレイアウト。');
  const [sourcePhotoUrl, setSourcePhotoUrl] = useState<string>();
  const [sourcePhotoData, setSourcePhotoData] = useState<string>();
  const [sourcePhotoName, setSourcePhotoName] = useState<string>();
  const [selections, setSelections] = useState<Record<SelectionSlot, string>>({ ...DEFAULT_SELECTIONS });
  const [enabledSlots, setEnabledSlots] = useState<SelectionSlot[]>(['floor', 'walls', 'ceiling']);
  const [accessories, setAccessories] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({ ...DEFAULT_QUANTITIES });
  const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({});
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [previewStale, setPreviewStale] = useState(false);
  const [viewMode, setViewMode] = useState<'source' | 'preview'>('source');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string>();
  const [assumedCeilingHeight, setAssumedCeilingHeight] = useState(2.4);
  const [surfaceEstimate, setSurfaceEstimate] = useState<SurfaceEstimate>();
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState<string>();
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = (ja: string, en: string) => pick(language, ja, en);
  const room = ROOM_TYPES.find((candidate) => candidate.id === roomType) || ROOM_TYPES[0];
  const designStyle = STYLE_OPTIONS.find((candidate) => candidate.id === style) || STYLE_OPTIONS[0];
  const activeSlotDefinitions = useMemo(() => {
    const coreSlots: SelectionSlot[] = ['floor', 'walls', 'ceiling', 'lighting'];
    const kitchenSlots: SelectionSlot[] = ['counter', 'cabinet', 'backsplash', 'faucet', 'sink', 'hardware'];
    const washroomSlots: SelectionSlot[] = ['counter', 'cabinet', 'faucet', 'sink', 'hardware'];
    const activeSlots = roomType === 'ldk' || roomType === 'kitchen'
      ? [...coreSlots, ...kitchenSlots]
      : roomType === 'washroom'
        ? [...coreSlots, ...washroomSlots]
        : coreSlots;
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
    const reader = new FileReader();
    reader.onload = () => {
      if (sourcePhotoUrl) URL.revokeObjectURL(sourcePhotoUrl);
      setSourcePhotoUrl(URL.createObjectURL(file));
      setSourcePhotoData(String(reader.result));
      setSourcePhotoName(file.name);
      setPreviewUrl(undefined);
      setPreviewStale(false);
      setViewMode('source');
      setPreviewError(undefined);
      setSurfaceEstimate(undefined);
      setEstimateError(undefined);
      setQuantities((current) => ({
        ...current,
        [selections.floor]: DEFAULT_SLOT_QUANTITY.floor,
        [selections.walls]: DEFAULT_SLOT_QUANTITY.walls,
        [selections.ceiling]: DEFAULT_SLOT_QUANTITY.ceiling,
      }));
    };
    reader.readAsDataURL(file);
  };

  const updateSelection = (slot: SelectionSlot, itemId: string) => {
    setSelections((current) => ({ ...current, [slot]: itemId }));
    setQuantities((current) => ({ ...current, [itemId]: current[itemId] ?? surfaceQuantity(surfaceEstimate, slot) ?? DEFAULT_SLOT_QUANTITY[slot] }));
    if (previewUrl) setPreviewStale(true);
  };

  const toggleSlot = (slot: SelectionSlot) => {
    setEnabledSlots((current) => current.includes(slot) ? current.filter((id) => id !== slot) : [...current, slot]);
    if (previewUrl) setPreviewStale(true);
  };

  const toggleAccessory = (itemId: string) => {
    setAccessories((current) => current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]);
    if (previewUrl) setPreviewStale(true);
  };

  const updatePrice = (itemId: string, value: string) => {
    setPriceOverrides((current) => {
      const next = { ...current };
      if (value === '') delete next[itemId];
      else next[itemId] = Number(value);
      return next;
    });
  };

  const estimateSurfaces = async () => {
    if (!sourcePhotoData) {
      setEstimateError(t('先に室内写真をアップロードしてください。', 'Upload a room photo first.'));
      return;
    }
    setEstimateLoading(true);
    setEstimateError(undefined);
    try {
      const response = await fetch('/api/estimate-room-surfaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePhoto: sourcePhotoData,
          room: room.en,
          assumedCeilingHeight,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.estimate) throw new Error(payload.error || 'Surface estimation failed');
      const estimate = payload.estimate as SurfaceEstimate;
      setSurfaceEstimate(estimate);
      setQuantities((current) => ({
        ...current,
        [selections.floor]: estimate.floorAreaM2,
        [selections.walls]: estimate.netWallAreaM2,
        [selections.ceiling]: estimate.ceilingAreaM2,
      }));
    } catch (error) {
      setEstimateError(error instanceof Error ? error.message : t('面積の推定に失敗しました。', 'Surface estimation failed.'));
    } finally {
      setEstimateLoading(false);
    }
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
      const payload = await response.json();
      if (!response.ok || !payload.image) throw new Error(payload.error || 'Preview generation failed');
      setPreviewUrl(payload.image);
      setPreviewStale(false);
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
    const pricingNote = unpricedCount
      ? t(`未入力単価 ${unpricedCount}件は合計に含まれていません。`, `${unpricedCount} unpriced item(s) are excluded from totals.`)
      : t('全選定品に単価が入力されています。', 'All selected items have entered prices.');
    return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(projectName)} ${t('内装提案・見積基礎資料', 'Interior proposal and estimate basis')}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700&family=Chivo+Mono:wght@400;500&family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap"><style>body{margin:0;background:#f7f8fa;color:#1c1e21;font-family:'Inter','Noto Sans JP',system-ui,sans-serif;font-size:13px;line-height:1.5}.page{max-width:1280px;margin:32px auto;background:#fff;border:1px solid #e5e7eb;padding:48px}.top{display:flex;justify-content:space-between;gap:32px;border-bottom:1px solid #e5e7eb;padding-bottom:24px}.eyebrow{font-size:10px;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:#9ca3af}.eyebrow::after{content:"";display:block;width:48px;height:2px;margin-top:8px;background:#1f4cda}h1{margin:16px 0 8px;font-family:'Archivo','Noto Sans JP',system-ui,sans-serif;font-size:32px;font-weight:700;letter-spacing:-.03em}.meta{font-size:12px;color:#6b7280}.summary{text-align:right}.summary strong{font-size:13px;font-weight:600}.preview{display:block;width:100%;max-height:600px;object-fit:contain;margin:32px 0;border:1px solid #e5e7eb;background:#f5f6fa}.preview.empty{height:280px;display:grid;place-items:center;color:#9ca3af;font-size:12px}.measurement{display:flex;gap:16px;align-items:baseline;padding:14px 16px;background:#eef3fd;border-left:2px solid #1f4cda;font-size:12px}.measurement strong{font-weight:600}.measurement span{font-family:'Chivo Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}.measurement small{margin-left:auto;color:#6b7280}h2{margin:32px 0 12px;font-family:'Archivo','Noto Sans JP',system-ui,sans-serif;font-size:20px;font-weight:700;letter-spacing:-.03em}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#fff;text-align:left;padding:10px 8px;border-bottom:1px solid #e5e7eb;color:#9ca3af;font-size:10px;font-weight:600;letter-spacing:.15em;text-transform:uppercase}td{padding:10px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top}td small{display:block;color:#6b7280;margin-top:4px}.status{font-weight:600;color:#1f4cda}.swatch{display:block;width:36px;height:30px;border:1px solid #e5e7eb}.num{text-align:right;font-family:'Chivo Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}.totals{width:380px;margin:24px 0 0 auto}.totals div{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb}.totals strong{font-family:'Chivo Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;font-weight:500}.totals .grand{font-size:18px;border-top:1px solid #1c1e21;border-bottom:0;margin-top:6px;padding-top:12px}.totals .grand strong{color:#1f4cda;font-weight:600}.pricing{color:#1f4cda;font-size:11px;text-align:right;margin-top:10px}.note{margin-top:32px;padding:14px 16px;background:#f5f6fa;font-size:11px;color:#6b7280}a{color:#1f4cda;text-decoration:none}@media print{body{background:#fff}.page{margin:0;max-width:none;border:0;padding:16px}.preview{max-height:420px}}</style></head><body><main class="page"><header class="top"><div><div class="eyebrow">ArchiX · Interior Proposal POC</div><h1>${escapeHtml(projectName)}</h1><div class="meta">${escapeHtml(customerName)} · ${escapeHtml(room[language === 'ja' ? 'ja' : 'en'])} · ${escapeHtml(designStyle[language === 'ja' ? 'ja' : 'en'])}</div></div><div class="summary"><strong>${t('内装提案・見積基礎資料', 'Interior proposal & estimate basis')}</strong><div class="meta">${generatedAt}</div></div></header>${preview}${measurementSummary}<h2>${t('材料・設備・参考家具明細', 'Materials, fixtures & reference furniture')}</h2><table><thead><tr><th>${t('画像', 'Image')}</th><th>${t('区分・状態', 'Section / status')}</th><th>${t('品名・仕様', 'Description / specification')}</th><th>${t('サイズ', 'Size')}</th><th>${t('色・品番', 'Color / code')}</th><th>${t('メーカー・出典', 'Maker / source')}</th><th>${t('数量', 'Qty')}</th><th>${t('単位', 'Unit')}</th><th>${t('単価', 'Unit price')}</th><th>${t('金額', 'Amount')}</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div><span>${t('小計', 'Subtotal')}</span><strong>${currency(subtotal, language)}</strong></div><div><span>${t('消費税 10%', 'Tax 10%')}</span><strong>${currency(tax, language)}</strong></div><div class="grand"><span>${t('合計', 'Total')}</span><strong>${currency(total, language)}</strong></div></div><div class="pricing">${escapeHtml(pricingNote)}</div><div class="note">${t('本書の品番・単価・家具はブランドを使用しないPOCサンプルです。写真からの面積はAI概算であり、正式見積・発注前に現場採寸と実商品データへ置き換えてください。AI画像は完成イメージであり、製品外観を保証しません。', 'SKUs, prices, and furniture in this document are unbranded POC samples. Photo-derived areas are AI estimates; replace them with site measurements and real product data before formal estimating or ordering. AI imagery is conceptual and does not guarantee exact product appearance.')}</div></main></body></html>`;
  };

  const exportCsv = () => {
    const header = language === 'ja'
      ? ['区分', '仕様区分', '品名', '仕様', 'サイズ', '色', '品番', 'メーカー', '出典', '出典URL', '商品確定', '数量', '単位', '単価', '金額']
      : ['Section', 'Specification status', 'Description', 'Specification', 'Size', 'Color', 'Product code', 'Manufacturer', 'Source', 'Source URL', 'Exact product confirmed', 'Quantity', 'Unit', 'Unit price', 'Amount'];
    const rows = selectedItems.map((item) => {
      const quantity = getQuantity(item);
      const unitPrice = getUnitPrice(item);
      return [
        SECTION_LABELS[item.section][language], statusLabel(item.status, language), itemName(item, language),
        itemSpecification(item, language), item.size, itemColor(item, language), item.productCode || '',
        itemManufacturer(item, language), itemSource(item, language), item.sourceUrl || '',
        item.exactProductConfirmed ? t('確定', 'Confirmed') : t('要確認', 'Confirmation required'),
        String(quantity), itemUnit(item, language), unitPrice === undefined ? '' : String(unitPrice),
        unitPrice === undefined ? '' : String(quantity * unitPrice),
      ];
    });
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    downloadBlob(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }), `asahi-${roomType}-estimate-items.csv`);
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
          <div className="live-count"><i />{t('仕上げ表', 'Schedule')} · {selectedItems.length} {t('点選択中', 'selected')}</div>
        </section>

        <section className="quick-fields" aria-label={t('案件情報', 'Project details')}>
          <label><span>{t('案件名', 'Project')}</span><input value={projectName} onChange={(event) => setProjectName(event.target.value)} /></label>
          <label><span>{t('顧客', 'Customer')}</span><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></label>
          <label><span>{t('部屋', 'Room')}</span><select value={roomType} onChange={(event) => { setRoomType(event.target.value); if (previewUrl) setPreviewStale(true); }}>{ROOM_TYPES.map((option) => <option key={option.id} value={option.id}>{option[language === 'ja' ? 'ja' : 'en']}</option>)}</select></label>
          <label><span>{t('スタイル', 'Style')}</span><select value={style} onChange={(event) => { setStyle(event.target.value); if (previewUrl) setPreviewStale(true); }}>{STYLE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option[language === 'ja' ? 'ja' : 'en']}</option>)}</select></label>
          <label className="brief-field"><span>{t('要望', 'Brief')}</span><input value={requestNote} onChange={(event) => { setRequestNote(event.target.value); if (previewUrl) setPreviewStale(true); }} /></label>
        </section>

        <section className="studio-workspace">
          <div className="visual-panel">
            <div className="visual-toolbar">
              <div className="view-tabs" role="tablist">
                <button className={viewMode === 'source' ? 'active' : ''} onClick={() => setViewMode('source')} disabled={!sourcePhotoUrl}>{t('元の写真', 'Original')}</button>
                <button className={viewMode === 'preview' ? 'active' : ''} onClick={() => setViewMode('preview')} disabled={!previewUrl}>{t('変更後', 'Preview')}</button>
              </div>
              <div className="visual-tools">
                <span className={`render-state ${previewUrl && !previewStale ? 'ready' : ''}`}>{previewLoading ? t('生成中…', 'Rendering…') : previewStale ? t('更新が必要', 'Update needed') : previewUrl ? t('プレビュー生成済み', 'Preview ready') : t('元の写真', 'Original photo')}</span>
                <button className="change-photo" onClick={() => fileInputRef.current?.click()}>{sourcePhotoUrl ? t('写真を変更', 'Change photo') : t('写真を選択', 'Choose photo')}</button>
              </div>
            </div>

            <section className="surface-estimator" aria-label={t('面積の自動推定', 'Automatic surface estimate')}>
              <div className="estimate-intro"><span>AI AREA ESTIMATE</span><strong>{t('床・壁・天井の面積を写真から概算', 'Estimate floor, wall, and ceiling areas from the photo')}</strong><small>{t('天井高を基準にしたPOC概算。結果は仕上げ表の数量へ自動反映され、あとから編集できます。', 'POC estimate anchored by ceiling height. Results populate the schedule and remain editable.')}</small></div>
              <label className="height-input"><span>{t('想定天井高', 'Assumed height')}</span><div><input type="number" min="2" max="5" step="0.1" value={assumedCeilingHeight} onChange={(event) => setAssumedCeilingHeight(Number(event.target.value) || 2.4)} /><em>m</em></div></label>
              <button className="estimate-button" disabled={!sourcePhotoData || estimateLoading} onClick={estimateSurfaces}>{estimateLoading ? t('推定中…', 'Estimating…') : t('面積を自動推定', 'Estimate areas')}</button>
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
                    : <div className="upload-message"><span>＋</span><strong>{t('室内写真をアップロード', 'Upload a room photo')}</strong><small>PNG / JPEG · {t('最大12MB', '12 MB max')}</small></div>}
            </div>

            {previewError && <div className="render-error"><strong>{t('生成できませんでした', 'Could not generate')}</strong><span>{previewError}</span></div>}
            <div className="render-bar">
              <p className="gemini-notice">{t('生成すると、写真と選択内容がGoogle Geminiへ送信されます。', 'Rendering sends the photo and selections to Google Gemini.')}</p>
              <button className="render-button" disabled={previewLoading || !sourcePhotoData || !selectedItems.length} onClick={generatePreview}>{previewLoading ? t('生成中…', 'Rendering…') : previewUrl ? t('選択内容で再生成', 'Render selected changes') : t('変更後を生成', 'Render new view')} <span>→</span></button>
            </div>
          </div>

          <aside className="changes-panel">
            <div className="changes-heading"><div><span>CHANGES TO APPLY</span><h2>{t('反映するもの', 'Choose what to change')}</h2></div><strong>{selectedItems.length}</strong></div>
            <div className="changes-scroll">
              <section className="check-group">
                <h3>{t('仕上げ・設備', 'Finishes & fixtures')}</h3>
                {activeSlotDefinitions.map((slot) => {
                  const item = CATALOG.find((candidate) => candidate.id === selections[slot.id])!;
                  const checked = enabledSlots.includes(slot.id);
                  return <div className={`change-check ${checked ? 'checked' : ''}`} key={slot.id}>
                    <label><input type="checkbox" checked={checked} onChange={() => toggleSlot(slot.id)} /><span className="check-mark">✓</span><span className="mini-swatch" style={{ background: item.swatch }} /><span className="change-copy"><strong>{language === 'ja' ? slot.labelJa : slot.labelEn}</strong><small>{itemName(item, language)} · {statusLabel(item.status, language)}</small></span></label>
                    <select value={item.id} disabled={!checked} onChange={(event) => updateSelection(slot.id, event.target.value)}>{CATALOG.filter((candidate) => candidate.slot === slot.id).map((option) => <option key={option.id} value={option.id}>{itemName(option, language)} · {itemColor(option, language)}</option>)}</select>
                  </div>;
                })}
              </section>
              <section className="check-group furniture-group">
                <h3>{t('参考家具・アクセサリー', 'Reference furniture & accessories')}</h3>
                <p className="reference-note">{t('外部ブランドを使用しないPOC用の品番・価格です', 'Unbranded POC sample SKUs and prices')}</p>
                {CATALOG.filter((item) => item.section === 'accessory').map((item) => {
                  const checked = accessories.includes(item.id);
                  return <label className={`furniture-check ${checked ? 'checked' : ''}`} key={item.id}><input type="checkbox" checked={checked} onChange={() => toggleAccessory(item.id)} /><span className="check-mark">✓</span><span className="mini-swatch" style={{ background: item.swatch }} /><span><strong>{itemName(item, language)}</strong><small>{itemColor(item, language)} · {currency(item.unitPrice || 0, language)}</small></span></label>;
                })}
              </section>
            </div>
            <div className="selection-total"><span>{t('選択中', 'Selected')}</span><strong>{selectedItems.length} {t('点', 'items')}</strong><em>{unpricedCount ? t(`未入力 ${unpricedCount}件`, `${unpricedCount} unpriced`) : currency(total, language)}</em></div>
          </aside>
        </section>

        <section className="schedule-panel">
          <div className="schedule-heading">
            <div><span><i /> LIVE</span><h2>{t('仕上げ表', 'Finish schedule')}</h2><p>{t('チェックした内容がすぐに反映されます', 'Checked items appear here immediately')}</p></div>
            <div className="export-actions"><button onClick={exportCsv}>CSV</button><button onClick={printProposal}>{t('印刷 / PDF', 'Print / PDF')}</button><button className="primary" onClick={exportProposal}>{t('提案書を出力', 'Export proposal')}</button></div>
          </div>
          <div className="schedule-table-wrap"><table className="schedule-table"><thead><tr><th>{t('選定品', 'Selected item')}</th><th>{t('区分・状態', 'Type / status')}</th><th>{t('色・品番', 'Color / code')}</th><th>{t('メーカー・出典', 'Maker / source')}</th><th>{t('数量', 'Qty')}</th><th>{t('単価', 'Unit price')}</th><th>{t('金額', 'Amount')}</th></tr></thead><tbody>
            {selectedItems.length ? selectedItems.map((item) => {
              const quantity = getQuantity(item); const unitPrice = getUnitPrice(item);
              const isAiQuantity = Boolean(surfaceEstimate && item.slot && ['floor', 'walls', 'ceiling'].includes(item.slot));
              return <tr key={item.id}><td><div className="schedule-item"><span style={{ background: item.swatch }} /><div><strong>{itemName(item, language)}</strong><small>{itemSpecification(item, language)} · {item.size}</small></div></div></td><td><span className={`type-pill ${item.section}`}>{SECTION_LABELS[item.section][language]}</span><span className={`status-pill ${item.status}`}>{statusLabel(item.status, language)}</span></td><td>{itemColor(item, language)}<code>{item.productCode || t('品番要確認', 'SKU to confirm')}</code></td><td><span className="maker-name">{itemManufacturer(item, language)}</span>{item.sourceUrl ? <a className="source-link" href={item.sourceUrl} target="_blank" rel="noreferrer">{itemSource(item, language)} ↗</a> : <small>{itemSource(item, language)}</small>}</td><td><div className="qty-control"><input type="number" min="0" step="0.1" value={quantity} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: Number(event.target.value) }))} /><span>{itemUnit(item, language)}</span>{isAiQuantity && <small>{t('AI概算', 'AI est.')}</small>}</div></td><td><input className={`unit-price ${unitPrice === undefined ? 'unpriced' : ''}`} aria-label={`${itemName(item, language)} ${t('単価', 'unit price')}`} type="number" min="0" step="100" value={unitPrice ?? ''} placeholder={t('見積', 'Quote')} onChange={(event) => updatePrice(item.id, event.target.value)} /></td><td className="line-total">{unitPrice === undefined ? '—' : currency(quantity * unitPrice, language)}</td></tr>;
            }) : <tr><td colSpan={7} className="empty-schedule">{t('右側のチェックボックスから反映する項目を選んでください。', 'Choose items from the checklist to build the schedule.')}</td></tr>}
          </tbody></table></div>
          <div className="schedule-footer"><p>{t('公開資料は仕様カテゴリの根拠です。メーカー・品番・価格・家具の取扱は現行商品マスターで確認してください。AI画像は完成イメージです。', 'Public documents verify specification categories only. Confirm makers, SKUs, prices, and furniture supply against the current product master. AI imagery is conceptual.')}{unpricedCount > 0 && <strong className="pricing-warning"> {t(`未入力単価 ${unpricedCount}件は合計に含まれません。`, `${unpricedCount} unpriced item(s) are excluded from totals.`)}</strong>}</p><div className="schedule-totals"><span>{t('入力済み小計', 'Entered subtotal')} <strong>{currency(subtotal, language)}</strong></span><span>{t('消費税', 'Tax')} <strong>{currency(tax, language)}</strong></span><span className="total">{t('入力済み合計', 'Entered total')} <strong>{currency(total, language)}</strong></span></div></div>
        </section>
      </main>
    </div>
  );
}
