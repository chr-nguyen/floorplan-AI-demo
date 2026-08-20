import type { Language } from '../i18n';

export type CatalogSection = 'finish' | 'fixture' | 'accessory';
export type SelectionSlot = 'floor' | 'walls' | 'ceiling' | 'counter' | 'cabinet' | 'backsplash' | 'faucet' | 'sink' | 'hardware' | 'lighting';
export type SpecificationStatus = 'standard' | 'standardPlus' | 'option' | 'reference';

export interface CatalogItem {
  id: string;
  slot?: SelectionSlot;
  section: CatalogSection;
  nameJa: string;
  nameEn: string;
  specificationJa: string;
  specificationEn: string;
  size: string;
  colorJa: string;
  colorEn: string;
  productCode?: string;
  manufacturerJa: string;
  manufacturerEn: string;
  unitJa: string;
  unitEn: string;
  unitPrice?: number;
  swatch: string;
  status: SpecificationStatus;
  sourceJa: string;
  sourceEn: string;
  sourceUrl?: string;
  exactProductConfirmed: boolean;
}

const POC_UNIT_PRICES: Record<string, number> = {
  'floor-wide-natural': 12800, 'floor-wide-light': 13900, 'floor-wide-dark': 16800,
  'floor-wide-greige': 13400, 'floor-herringbone-oak': 21800, 'floor-tile-stone': 15600,
  'floor-carpet-warm-beige': 9200, 'floor-carpet-greige': 9600, 'floor-carpet-charcoal': 10400,
  'floor-carpet-muted-blue': 10800, 'floor-carpet-sage': 10800,
  'floor-tile-ivory': 15800, 'floor-tile-sand': 16400, 'floor-tile-concrete': 17200,
  'floor-tile-slate': 18400, 'floor-tile-terrazzo': 19800, 'floor-tile-sage': 17600,
  'wall-vinyl-white': 1850, 'wall-vinyl-warm-white': 1900, 'wall-accent-greige': 2200,
  'wall-accent-blue': 2450, 'wall-accent-charcoal': 2400, 'wall-accent-sage': 2350, 'wall-wood-panel': 6800,
  'ceiling-vinyl-white': 1700, 'ceiling-vinyl-warm-white': 1750, 'ceiling-wood-panel': 7400,
  'counter-solid-white': 198000, 'counter-solid-greige': 215000, 'counter-solid-black': 212000,
  'counter-quartz-stone': 268000, 'counter-stainless': 186000,
  'cabinet-system-white': 365000, 'cabinet-system-oak': 420000, 'cabinet-system-charcoal': 388000,
  'cabinet-system-walnut': 448000, 'cabinet-system-sage': 402000,
  'backsplash-panel-white': 74000, 'backsplash-panel-gray': 84000, 'backsplash-panel-charcoal': 88000,
  'backsplash-tile-white': 96000,
  'faucet-kitchen-mixer': 98000, 'faucet-kitchen-black': 112000, 'faucet-touchless': 168000,
  'sink-system-kitchen': 88000, 'sink-artificial-white': 104000, 'sink-wide-stainless': 118000,
  'hardware-integrated-silver': 42000, 'hardware-integrated-black': 48000,
  'hardware-integrated-brass': 56000, 'hardware-handleless': 62000,
  'lighting-rail-white': 85000, 'lighting-rail-black': 92000, 'lighting-downlight-warm': 78000,
  'lighting-pendant-three': 124000, 'lighting-indirect-cove': 156000,
  'accessory-curtain': 68000, 'accessory-table': 238000, 'accessory-sofa': 328000,
  'accessory-rug': 118000, 'accessory-chair': 186000, 'accessory-coffee-table': 142000,
  'accessory-bed': 298000, 'accessory-plant': 48000, 'accessory-dining-chairs': 148000,
  'accessory-tv-board': 168000, 'accessory-shelf': 96000, 'accessory-floor-lamp': 62000,
  'accessory-artwork': 78000, 'accessory-bedside': 54000,
};

const pocCode = (id: string) => `POC-${id.toUpperCase().replaceAll('-', '_')}`;

export const SLOT_DEFINITIONS: Array<{ id: SelectionSlot; labelJa: string; labelEn: string; required: boolean }> = [
  { id: 'floor', labelJa: '床', labelEn: 'Floor', required: true },
  { id: 'walls', labelJa: '壁', labelEn: 'Walls', required: true },
  { id: 'ceiling', labelJa: '天井', labelEn: 'Ceiling', required: true },
  { id: 'counter', labelJa: 'カウンター・天板', labelEn: 'Countertop', required: true },
  { id: 'cabinet', labelJa: 'キャビネット', labelEn: 'Cabinets', required: true },
  { id: 'backsplash', labelJa: 'キッチンパネル', labelEn: 'Kitchen panel', required: true },
  { id: 'faucet', labelJa: '水栓', labelEn: 'Faucet', required: true },
  { id: 'sink', labelJa: 'シンク・洗面ボウル', labelEn: 'Sink / basin', required: true },
  { id: 'hardware', labelJa: '取手・金物', labelEn: 'Hardware', required: true },
  { id: 'lighting', labelJa: '照明', labelEn: 'Lighting', required: true },
];

const publicItem = (item: Omit<CatalogItem, 'sourceJa' | 'sourceEn' | 'sourceUrl' | 'exactProductConfirmed'> & { sourceUrl?: string }): CatalogItem => ({
  ...item,
  productCode: item.productCode || pocCode(item.id),
  manufacturerJa: item.manufacturerJa || '要確認',
  manufacturerEn: item.manufacturerEn || 'To be confirmed',
  unitPrice: item.unitPrice ?? POC_UNIT_PRICES[item.id],
  sourceJa: '公開仕様を基にしたPOCデータ',
  sourceEn: 'POC data based on published specifications',
  exactProductConfirmed: false,
});

const referenceFurniture = (item: Omit<CatalogItem, 'section' | 'manufacturerJa' | 'manufacturerEn' | 'unitPrice' | 'status' | 'sourceJa' | 'sourceEn' | 'sourceUrl' | 'exactProductConfirmed'>): CatalogItem => ({
  ...item,
  section: 'accessory',
  productCode: item.productCode || pocCode(item.id),
  manufacturerJa: '参考家具セレクト（POC）',
  manufacturerEn: 'Reference Furniture Selection (POC)',
  unitPrice: POC_UNIT_PRICES[item.id],
  status: 'reference',
  sourceJa: 'ブランドを使用しないPOCサンプル家具',
  sourceEn: 'Unbranded POC sample furniture',
  exactProductConfirmed: false,
});

export const CATALOG: CatalogItem[] = [
  publicItem({ id: 'floor-wide-natural', slot: 'floor', section: 'finish', nameJa: '巾広フローリング', nameEn: 'Wide-plank flooring', specificationJa: '公開 Standard＋仕様を基にした提案。メーカー・品番は要確認', specificationEn: 'Proposal based on a published Standard+ specification; maker and SKU require confirmation', size: '巾広タイプ / wide plank', colorJa: 'ナチュラル木目（提案色）', colorEn: 'Natural wood (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#bc8d5c', status: 'standardPlus' }),
  publicItem({ id: 'floor-wide-light', slot: 'floor', section: 'finish', nameJa: '巾広フローリング', nameEn: 'Wide-plank flooring', specificationJa: '公開 Standard＋仕様を基にした提案。メーカー・品番は要確認', specificationEn: 'Proposal based on a published Standard+ specification; maker and SKU require confirmation', size: '巾広タイプ / wide plank', colorJa: 'ライトオーク（提案色）', colorEn: 'Light oak (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#d3bd94', status: 'standardPlus' }),
  publicItem({ id: 'floor-wide-dark', slot: 'floor', section: 'finish', nameJa: '巾広フローリング', nameEn: 'Wide-plank flooring', specificationJa: '公開 Standard＋仕様を基にした提案。メーカー・品番は要確認', specificationEn: 'Proposal based on a published Standard+ specification; maker and SKU require confirmation', size: '巾広タイプ / wide plank', colorJa: 'ダークブラウン（提案色）', colorEn: 'Dark brown (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#74513d', status: 'standardPlus' }),
  publicItem({ id: 'floor-wide-greige', slot: 'floor', section: 'finish', nameJa: '巾広フローリング', nameEn: 'Wide-plank flooring', specificationJa: '公開 Standard＋仕様を基にした提案。メーカー・品番は要確認', specificationEn: 'Proposal based on a published Standard+ specification; maker and SKU require confirmation', size: '巾広タイプ / wide plank', colorJa: 'グレージュオーク（提案色）', colorEn: 'Greige oak (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#c0b3a1', status: 'standardPlus' }),
  publicItem({ id: 'floor-herringbone-oak', slot: 'floor', section: 'finish', nameJa: 'ヘリンボーンフローリング', nameEn: 'Herringbone flooring', specificationJa: '公開 Standard＋仕様を基にした提案。メーカー・品番は要確認', specificationEn: 'Proposal based on a published Standard+ specification; maker and SKU require confirmation', size: 'ヘリンボーン張り / herringbone lay', colorJa: 'オーク（提案色）', colorEn: 'Oak (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#c99a63', status: 'option' }),
  publicItem({ id: 'floor-tile-stone', slot: 'floor', section: 'finish', nameJa: '石目調フロアタイル', nameEn: 'Stone-look floor tile', specificationJa: '公開 Standard＋仕様を基にした提案。メーカー・品番は要確認', specificationEn: 'Proposal based on a published Standard+ specification; maker and SKU require confirmation', size: '300角相当 / 300 mm module', colorJa: 'ライトストーン（提案色）', colorEn: 'Light stone (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#d8d6d0', status: 'option' }),
  publicItem({ id: 'floor-carpet-warm-beige', slot: 'floor', section: 'finish', nameJa: 'ループパイルカーペット', nameEn: 'Loop-pile carpet', specificationJa: '住宅用の柔らかなループパイル。防炎・遮音性能と品番は選定時に確認', specificationEn: 'Soft residential loop pile; confirm fire and acoustic ratings and SKU at selection', size: '500角タイル / 500 mm tile', colorJa: 'ウォームベージュ（提案色）', colorEn: 'Warm beige (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#cbbda7', status: 'option' }),
  publicItem({ id: 'floor-carpet-greige', slot: 'floor', section: 'finish', nameJa: 'ループパイルカーペット', nameEn: 'Loop-pile carpet', specificationJa: '住宅用の柔らかなループパイル。防炎・遮音性能と品番は選定時に確認', specificationEn: 'Soft residential loop pile; confirm fire and acoustic ratings and SKU at selection', size: '500角タイル / 500 mm tile', colorJa: 'グレージュ（提案色）', colorEn: 'Greige (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#a9a298', status: 'option' }),
  publicItem({ id: 'floor-carpet-charcoal', slot: 'floor', section: 'finish', nameJa: 'ループパイルカーペット', nameEn: 'Loop-pile carpet', specificationJa: '住宅用の柔らかなループパイル。防炎・遮音性能と品番は選定時に確認', specificationEn: 'Soft residential loop pile; confirm fire and acoustic ratings and SKU at selection', size: '500角タイル / 500 mm tile', colorJa: 'チャコール（提案色）', colorEn: 'Charcoal (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#5f625f', status: 'option' }),
  publicItem({ id: 'floor-carpet-muted-blue', slot: 'floor', section: 'finish', nameJa: 'ループパイルカーペット', nameEn: 'Loop-pile carpet', specificationJa: '住宅用の柔らかなループパイル。防炎・遮音性能と品番は選定時に確認', specificationEn: 'Soft residential loop pile; confirm fire and acoustic ratings and SKU at selection', size: '500角タイル / 500 mm tile', colorJa: 'ミュートブルー（提案色）', colorEn: 'Muted blue (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#71828b', status: 'option' }),
  publicItem({ id: 'floor-carpet-sage', slot: 'floor', section: 'finish', nameJa: 'ループパイルカーペット', nameEn: 'Loop-pile carpet', specificationJa: '住宅用の柔らかなループパイル。防炎・遮音性能と品番は選定時に確認', specificationEn: 'Soft residential loop pile; confirm fire and acoustic ratings and SKU at selection', size: '500角タイル / 500 mm tile', colorJa: 'セージグリーン（提案色）', colorEn: 'Sage green (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#899485', status: 'option' }),
  publicItem({ id: 'floor-tile-ivory', slot: 'floor', section: 'finish', nameJa: '磁器質タイル', nameEn: 'Porcelain tile', specificationJa: 'マット仕上げの磁器質タイル。滑り抵抗・品番は選定時に確認', specificationEn: 'Matte porcelain tile; confirm slip rating and SKU at selection', size: '300角 / 300 mm module', colorJa: 'アイボリー（提案色）', colorEn: 'Ivory (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#e5dfd1', status: 'option' }),
  publicItem({ id: 'floor-tile-sand', slot: 'floor', section: 'finish', nameJa: 'トラバーチン調タイル', nameEn: 'Travertine-look tile', specificationJa: '穏やかな石目のマットタイル。滑り抵抗・柄リピート・品番は選定時に確認', specificationEn: 'Matte tile with subtle stone movement; confirm slip rating, pattern repeat, and SKU', size: '300角 / 300 mm module', colorJa: 'サンドベージュ（提案色）', colorEn: 'Sand beige (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#cdbb9d', status: 'option' }),
  publicItem({ id: 'floor-tile-concrete', slot: 'floor', section: 'finish', nameJa: 'コンクリート調タイル', nameEn: 'Concrete-look tile', specificationJa: '微細なムラ感のあるマットタイル。滑り抵抗・品番は選定時に確認', specificationEn: 'Matte tile with subtle tonal variation; confirm slip rating and SKU at selection', size: '300角 / 300 mm module', colorJa: 'ミッドグレー（提案色）', colorEn: 'Mid gray (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#9b9a95', status: 'option' }),
  publicItem({ id: 'floor-tile-slate', slot: 'floor', section: 'finish', nameJa: 'スレート調タイル', nameEn: 'Slate-look tile', specificationJa: '濃色の石目調マットタイル。滑り抵抗・柄リピート・品番は選定時に確認', specificationEn: 'Dark stone-look matte tile; confirm slip rating, pattern repeat, and SKU', size: '300角 / 300 mm module', colorJa: 'ダークスレート（提案色）', colorEn: 'Dark slate (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#555b5c', status: 'option' }),
  publicItem({ id: 'floor-tile-terrazzo', slot: 'floor', section: 'finish', nameJa: 'テラゾー調タイル', nameEn: 'Terrazzo-look tile', specificationJa: '細かな骨材柄の磁器質タイル。柄リピート・目地色・品番は選定時に確認', specificationEn: 'Porcelain tile with fine aggregate pattern; confirm repeat, grout color, and SKU', size: '300角 / 300 mm module', colorJa: 'ライトテラゾー（提案色）', colorEn: 'Light terrazzo (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#d6d0c5', status: 'option' }),
  publicItem({ id: 'floor-tile-sage', slot: 'floor', section: 'finish', nameJa: 'カラー磁器質タイル', nameEn: 'Colored porcelain tile', specificationJa: '落ち着いた色調のマット磁器質タイル。滑り抵抗・品番は選定時に確認', specificationEn: 'Muted-color matte porcelain tile; confirm slip rating and SKU at selection', size: '300角 / 300 mm module', colorJa: 'セージグリーン（提案色）', colorEn: 'Sage green (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#9aa795', status: 'option' }),

  publicItem({ id: 'wall-vinyl-white', slot: 'walls', section: 'finish', nameJa: 'ビニールクロス', nameEn: 'Vinyl wallpaper', specificationJa: 'LD・洋室の公開標準仕様。メーカー・品番・防火性能は選定時に確認', specificationEn: 'Public standard for living and Western-style rooms; confirm maker, SKU, and fire rating', size: '現場採寸 / site measure', colorJa: 'ホワイト（提案色）', colorEn: 'White (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#f0eee8', status: 'standard' }),
  publicItem({ id: 'wall-accent-greige', slot: 'walls', section: 'finish', nameJa: 'アクセントクロス', nameEn: 'Accent wallpaper', specificationJa: '公開 Standard＋仕様の1面アクセントクロス。品番は要確認', specificationEn: 'One-wall accent wallpaper from the public Standard+ specification; SKU requires confirmation', size: '1面 / one wall', colorJa: 'グレージュ（提案色）', colorEn: 'Greige (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#c9c0b2', status: 'standardPlus' }),
  publicItem({ id: 'wall-accent-blue', slot: 'walls', section: 'finish', nameJa: 'アクセントクロス', nameEn: 'Accent wallpaper', specificationJa: '公開 Standard＋仕様の1面アクセントクロス。品番は要確認', specificationEn: 'One-wall accent wallpaper from the public Standard+ specification; SKU requires confirmation', size: '1面 / one wall', colorJa: 'スモークブルー（提案色）', colorEn: 'Smoke blue (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#81999e', status: 'standardPlus' }),
  publicItem({ id: 'wall-vinyl-warm-white', slot: 'walls', section: 'finish', nameJa: 'ビニールクロス', nameEn: 'Vinyl wallpaper', specificationJa: 'LD・洋室の公開標準仕様。メーカー・品番・防火性能は選定時に確認', specificationEn: 'Public standard for living and Western-style rooms; confirm maker, SKU, and fire rating', size: '現場採寸 / site measure', colorJa: 'ウォームホワイト（提案色）', colorEn: 'Warm white (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#f5f1e9', status: 'standard' }),
  publicItem({ id: 'wall-accent-charcoal', slot: 'walls', section: 'finish', nameJa: 'アクセントクロス', nameEn: 'Accent wallpaper', specificationJa: '公開 Standard＋仕様の1面アクセントクロス。品番は要確認', specificationEn: 'One-wall accent wallpaper from the public Standard+ specification; SKU requires confirmation', size: '1面 / one wall', colorJa: 'チャコール（提案色）', colorEn: 'Charcoal (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#4a4b49', status: 'standardPlus' }),
  publicItem({ id: 'wall-accent-sage', slot: 'walls', section: 'finish', nameJa: 'アクセントクロス', nameEn: 'Accent wallpaper', specificationJa: '公開 Standard＋仕様の1面アクセントクロス。品番は要確認', specificationEn: 'One-wall accent wallpaper from the public Standard+ specification; SKU requires confirmation', size: '1面 / one wall', colorJa: 'セージグリーン（提案色）', colorEn: 'Sage green (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#9aa78f', status: 'standardPlus' }),
  publicItem({ id: 'wall-wood-panel', slot: 'walls', section: 'finish', nameJa: '木質パネル', nameEn: 'Wood wall panel', specificationJa: '公開 Standard＋仕様の1面アクセントクロス。品番は要確認', specificationEn: 'One-wall accent wallpaper from the public Standard+ specification; SKU requires confirmation', size: '1面 / one wall', colorJa: 'オーク木目（提案色）', colorEn: 'Oak woodgrain (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#b98a55', status: 'option' }),

  publicItem({ id: 'ceiling-vinyl-white', slot: 'ceiling', section: 'finish', nameJa: '天井ビニールクロス', nameEn: 'Ceiling vinyl wallpaper', specificationJa: 'LD・洋室の公開標準仕様。メーカー・品番は要確認', specificationEn: 'Public standard for living and Western-style rooms; maker and SKU require confirmation', size: '現場採寸 / site measure', colorJa: 'ホワイト（提案色）', colorEn: 'White (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#faf9f5', status: 'standard' }),
  publicItem({ id: 'ceiling-vinyl-warm-white', slot: 'ceiling', section: 'finish', nameJa: '天井ビニールクロス', nameEn: 'Ceiling vinyl wallpaper', specificationJa: 'LD・洋室の公開標準仕様。メーカー・品番は要確認', specificationEn: 'Public standard for living and Western-style rooms; maker and SKU require confirmation', size: '現場採寸 / site measure', colorJa: 'ウォームホワイト（提案色）', colorEn: 'Warm white (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#f6f2ea', status: 'standard' }),
  publicItem({ id: 'ceiling-wood-panel', slot: 'ceiling', section: 'finish', nameJa: '木目天井パネル', nameEn: 'Wood-look ceiling panel', specificationJa: 'LDの公開 Standard＋仕様を基にした提案。材質・品番は要確認', specificationEn: 'Proposal based on the public Standard+ living-room specification; confirm material and SKU', size: '一部張り / partial area', colorJa: 'ライトオーク（提案色）', colorEn: 'Light oak (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#cfa877', status: 'option' }),

  publicItem({ id: 'counter-solid-white', slot: 'counter', section: 'finish', nameJa: '人造大理石カウンター', nameEn: 'Solid-surface countertop', specificationJa: '公開 Standard＋システムキッチン仕様。メーカー・寸法・品番は要確認', specificationEn: 'Public Standard+ system-kitchen specification; confirm maker, dimensions, and SKU', size: 'システムキッチン一体 / integrated', colorJa: 'ホワイト（提案色）', colorEn: 'White (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#e9e7df', status: 'standardPlus' }),
  publicItem({ id: 'counter-solid-greige', slot: 'counter', section: 'finish', nameJa: '人造大理石カウンター', nameEn: 'Solid-surface countertop', specificationJa: '公開 Standard＋システムキッチン仕様。メーカー・寸法・品番は要確認', specificationEn: 'Public Standard+ system-kitchen specification; confirm maker, dimensions, and SKU', size: 'システムキッチン一体 / integrated', colorJa: 'グレージュ（提案色）', colorEn: 'Greige (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#c6c1b8', status: 'standardPlus' }),
  publicItem({ id: 'counter-solid-black', slot: 'counter', section: 'finish', nameJa: '人造大理石カウンター', nameEn: 'Solid-surface countertop', specificationJa: '公開 Standard＋システムキッチン仕様。メーカー・寸法・品番は要確認', specificationEn: 'Public Standard+ system-kitchen specification; confirm maker, dimensions, and SKU', size: 'システムキッチン一体 / integrated', colorJa: 'ブラック（提案色）', colorEn: 'Black (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#3a3b39', status: 'standardPlus' }),
  publicItem({ id: 'counter-quartz-stone', slot: 'counter', section: 'finish', nameJa: 'クオーツ調カウンター', nameEn: 'Quartz-look countertop', specificationJa: '公開 Standard＋システムキッチン仕様。メーカー・寸法・品番は要確認', specificationEn: 'Public Standard+ system-kitchen specification; confirm maker, dimensions, and SKU', size: 'システムキッチン一体 / integrated', colorJa: 'ライトグレーストーン（提案色）', colorEn: 'Light gray stone (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#cdcbc5', status: 'option' }),
  publicItem({ id: 'counter-stainless', slot: 'counter', section: 'finish', nameJa: 'ステンレスカウンター', nameEn: 'Stainless countertop', specificationJa: '公開 Standard＋システムキッチン仕様。メーカー・寸法・品番は要確認', specificationEn: 'Public Standard+ system-kitchen specification; confirm maker, dimensions, and SKU', size: 'システムキッチン一体 / integrated', colorJa: 'ステンレス調（提案）', colorEn: 'Stainless look (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#b2b7b8', status: 'standard' }),

  publicItem({ id: 'cabinet-system-white', slot: 'cabinet', section: 'fixture', nameJa: 'システムキッチン収納', nameEn: 'System-kitchen cabinetry', specificationJa: '公開標準仕様のスライド収納。扉材・メーカー・品番は要確認', specificationEn: 'Slide storage from the public standard; confirm door finish, maker, and SKU', size: 'プランによる / per plan', colorJa: 'ホワイト（提案色）', colorEn: 'White (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#e8e6df', status: 'standard' }),
  publicItem({ id: 'cabinet-system-oak', slot: 'cabinet', section: 'fixture', nameJa: 'システムキッチン収納', nameEn: 'System-kitchen cabinetry', specificationJa: '公開標準仕様のスライド収納。扉材・メーカー・品番は要確認', specificationEn: 'Slide storage from the public standard; confirm door finish, maker, and SKU', size: 'プランによる / per plan', colorJa: 'オーク木目（提案色）', colorEn: 'Oak woodgrain (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#ad7f50', status: 'standard' }),
  publicItem({ id: 'cabinet-system-charcoal', slot: 'cabinet', section: 'fixture', nameJa: 'システムキッチン収納', nameEn: 'System-kitchen cabinetry', specificationJa: '公開標準仕様のスライド収納。扉材・メーカー・品番は要確認', specificationEn: 'Slide storage from the public standard; confirm door finish, maker, and SKU', size: 'プランによる / per plan', colorJa: 'チャコール（提案色）', colorEn: 'Charcoal (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#4e4d49', status: 'standard' }),
  publicItem({ id: 'cabinet-system-walnut', slot: 'cabinet', section: 'fixture', nameJa: 'システムキッチン収納', nameEn: 'System-kitchen cabinetry', specificationJa: '公開標準仕様のスライド収納。扉材・メーカー・品番は要確認', specificationEn: 'Slide storage from the public standard; confirm door finish, maker, and SKU', size: 'プランによる / per plan', colorJa: 'ウォルナット木目（提案色）', colorEn: 'Walnut woodgrain (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#6b4a35', status: 'option' }),
  publicItem({ id: 'cabinet-system-sage', slot: 'cabinet', section: 'fixture', nameJa: 'システムキッチン収納', nameEn: 'System-kitchen cabinetry', specificationJa: '公開標準仕様のスライド収納。扉材・メーカー・品番は要確認', specificationEn: 'Slide storage from the public standard; confirm door finish, maker, and SKU', size: 'プランによる / per plan', colorJa: 'セージグリーン マット（提案色）', colorEn: 'Matt sage green (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#8e9b86', status: 'option' }),

  publicItem({ id: 'backsplash-panel-white', slot: 'backsplash', section: 'finish', nameJa: 'キッチンパネル', nameEn: 'Kitchen panel', specificationJa: '台所の公開標準仕様。材質・メーカー・品番は要確認', specificationEn: 'Public kitchen standard; confirm material, maker, and SKU', size: '現場採寸 / site measure', colorJa: 'ホワイト（提案色）', colorEn: 'White (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#f3f2ed', status: 'standard' }),
  publicItem({ id: 'backsplash-panel-gray', slot: 'backsplash', section: 'finish', nameJa: 'キッチンパネル', nameEn: 'Kitchen panel', specificationJa: '台所の公開標準仕様。材質・メーカー・品番は要確認', specificationEn: 'Public kitchen standard; confirm material, maker, and SKU', size: '現場採寸 / site measure', colorJa: 'ライトグレー（提案色）', colorEn: 'Light gray (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#bbbcb9', status: 'standard' }),
  publicItem({ id: 'backsplash-panel-charcoal', slot: 'backsplash', section: 'finish', nameJa: 'キッチンパネル', nameEn: 'Kitchen panel', specificationJa: '台所の公開標準仕様。材質・メーカー・品番は要確認', specificationEn: 'Public kitchen standard; confirm material, maker, and SKU', size: '現場採寸 / site measure', colorJa: 'チャコール（提案色）', colorEn: 'Charcoal (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#4c4d4b', status: 'standard' }),
  publicItem({ id: 'backsplash-tile-white', slot: 'backsplash', section: 'finish', nameJa: 'タイル調キッチンパネル', nameEn: 'Tile-look kitchen panel', specificationJa: '台所の公開標準仕様。材質・メーカー・品番は要確認', specificationEn: 'Public kitchen standard; confirm material, maker, and SKU', size: '現場採寸 / site measure', colorJa: 'ホワイトタイル調（提案色）', colorEn: 'White tile look (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#e7e6e1', status: 'option' }),

  publicItem({ id: 'faucet-kitchen-mixer', slot: 'faucet', section: 'fixture', nameJa: 'システムキッチン水栓', nameEn: 'System-kitchen faucet', specificationJa: 'システムキッチン付属水栓。機能・メーカー・品番は要確認', specificationEn: 'Faucet supplied with the system kitchen; confirm features, maker, and SKU', size: '仕様による / per specification', colorJa: 'メタル調（提案）', colorEn: 'Metal finish (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '台', unitEn: 'ea', swatch: '#b9bdbe', status: 'standard' }),
  publicItem({ id: 'faucet-kitchen-black', slot: 'faucet', section: 'fixture', nameJa: 'システムキッチン水栓', nameEn: 'System-kitchen faucet', specificationJa: 'システムキッチン付属水栓。機能・メーカー・品番は要確認', specificationEn: 'Faucet supplied with the system kitchen; confirm features, maker, and SKU', size: '仕様による / per specification', colorJa: 'マットブラック（提案色）', colorEn: 'Matt black (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '台', unitEn: 'ea', swatch: '#3b3c3a', status: 'standardPlus' }),
  publicItem({ id: 'faucet-touchless', slot: 'faucet', section: 'fixture', nameJa: 'タッチレス水栓', nameEn: 'Touchless faucet', specificationJa: 'センサー水栓へのグレードアップ提案。電源工事・メーカー・品番は要確認', specificationEn: 'Upgrade proposal to a sensor faucet; confirm power provision, maker, and SKU', size: '仕様による / per specification', colorJa: 'メタル調（提案）', colorEn: 'Metal finish (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '台', unitEn: 'ea', swatch: '#a9aeb0', status: 'option' }),
  publicItem({ id: 'sink-system-kitchen', slot: 'sink', section: 'fixture', nameJa: 'システムキッチンシンク', nameEn: 'System-kitchen sink', specificationJa: 'システムキッチン一体。材質・寸法・メーカー・品番は要確認', specificationEn: 'Integrated with the system kitchen; confirm material, dimensions, maker, and SKU', size: '仕様による / per specification', colorJa: 'ステンレス調（提案）', colorEn: 'Stainless look (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '台', unitEn: 'ea', swatch: '#aeb5b7', status: 'standard' }),
  publicItem({ id: 'sink-artificial-white', slot: 'sink', section: 'fixture', nameJa: '人造大理石シンク', nameEn: 'Solid-surface sink', specificationJa: 'カウンター一体シンク。材質・寸法・メーカー・品番は要確認', specificationEn: 'Countertop-integrated sink; confirm material, dimensions, maker, and SKU', size: '仕様による / per specification', colorJa: 'ホワイト（提案色）', colorEn: 'White (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '台', unitEn: 'ea', swatch: '#e6e4dd', status: 'standardPlus' }),
  publicItem({ id: 'sink-wide-stainless', slot: 'sink', section: 'fixture', nameJa: 'ワイドステンレスシンク', nameEn: 'Wide stainless sink', specificationJa: '間口拡大シンクへのグレードアップ提案。寸法・メーカー・品番は要確認', specificationEn: 'Upgrade proposal to a wider sink; confirm dimensions, maker, and SKU', size: '仕様による / per specification', colorJa: 'ステンレス調（提案）', colorEn: 'Stainless look (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '台', unitEn: 'ea', swatch: '#a4abad', status: 'option' }),
  publicItem({ id: 'hardware-integrated-silver', slot: 'hardware', section: 'fixture', nameJa: 'キッチン扉取手', nameEn: 'Kitchen cabinet hardware', specificationJa: 'システムキッチン付属金物。形状・メーカー・品番は要確認', specificationEn: 'Hardware supplied with the system kitchen; confirm profile, maker, and SKU', size: '仕様による / per specification', colorJa: 'シルバー（提案色）', colorEn: 'Silver (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#b7b9b7', status: 'standard' }),
  publicItem({ id: 'hardware-integrated-black', slot: 'hardware', section: 'fixture', nameJa: 'キッチン扉取手', nameEn: 'Kitchen cabinet hardware', specificationJa: 'システムキッチン付属金物。形状・メーカー・品番は要確認', specificationEn: 'Hardware supplied with the system kitchen; confirm profile, maker, and SKU', size: '仕様による / per specification', colorJa: 'ブラック（提案色）', colorEn: 'Black (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#343533', status: 'standard' }),
  publicItem({ id: 'hardware-integrated-brass', slot: 'hardware', section: 'fixture', nameJa: 'キッチン扉取手', nameEn: 'Kitchen cabinet hardware', specificationJa: 'システムキッチン付属金物からの変更提案。形状・メーカー・品番は要確認', specificationEn: 'Change proposal from the supplied hardware; confirm profile, maker, and SKU', size: '仕様による / per specification', colorJa: '真鍮調（提案色）', colorEn: 'Brass finish (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#b08d4f', status: 'option' }),
  publicItem({ id: 'hardware-handleless', slot: 'hardware', section: 'fixture', nameJa: '手掛け仕様', nameEn: 'Handleless profile', specificationJa: '取手なしの手掛け仕様への変更提案。扉加工・メーカー・品番は要確認', specificationEn: 'Change proposal to a handleless profile; confirm door fabrication, maker, and SKU', size: '仕様による / per specification', colorJa: '扉材と共色（提案）', colorEn: 'Matched to door finish (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#d5d2cb', status: 'option' }),
  publicItem({ id: 'lighting-rail-white', slot: 'lighting', section: 'fixture', nameJa: 'ライティングレール＋スポットライト3灯', nameEn: 'Lighting rail with three spotlights', specificationJa: '公開 Standard＋仕様。器具メーカー・品番は要確認', specificationEn: 'Public Standard+ specification; fixture maker and SKU require confirmation', size: '3灯 / 3 lights', colorJa: 'ホワイト（提案色）', colorEn: 'White (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#f1f0eb', status: 'standardPlus' }),
  publicItem({ id: 'lighting-rail-black', slot: 'lighting', section: 'fixture', nameJa: 'ライティングレール＋スポットライト3灯', nameEn: 'Lighting rail with three spotlights', specificationJa: '公開 Standard＋仕様。器具メーカー・品番は要確認', specificationEn: 'Public Standard+ specification; fixture maker and SKU require confirmation', size: '3灯 / 3 lights', colorJa: 'ブラック（提案色）', colorEn: 'Black (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#30312f', status: 'standardPlus' }),
  publicItem({ id: 'lighting-downlight-warm', slot: 'lighting', section: 'fixture', nameJa: 'ダウンライト6灯', nameEn: 'Six downlights', specificationJa: '公開標準仕様の天井埋込照明。灯数・器具メーカー・品番は要確認', specificationEn: 'Recessed ceiling lighting from the public standard; confirm count, fixture maker, and SKU', size: '6灯 / 6 lights', colorJa: '電球色（提案）', colorEn: 'Warm white (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#f7efdf', status: 'standard' }),
  publicItem({ id: 'lighting-pendant-three', slot: 'lighting', section: 'fixture', nameJa: 'ペンダントライト3灯', nameEn: 'Three pendant lights', specificationJa: 'ダイニング上部への提案。取付位置・器具メーカー・品番は要確認', specificationEn: 'Proposal for above the dining table; confirm position, fixture maker, and SKU', size: '3灯 / 3 lights', colorJa: 'ブラック＋真鍮調（提案色）', colorEn: 'Black with brass (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#5a4b36', status: 'option' }),
  publicItem({ id: 'lighting-indirect-cove', slot: 'lighting', section: 'fixture', nameJa: '間接照明（コーブ）', nameEn: 'Indirect cove lighting', specificationJa: '天井際の間接照明。造作・電気工事・器具品番は要確認', specificationEn: 'Indirect lighting at the ceiling perimeter; confirm carpentry, electrical work, and SKU', size: '一部造作 / partial cove', colorJa: '電球色（提案）', colorEn: 'Warm white (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#f3e6cc', status: 'option' }),

  referenceFurniture({ id: 'accessory-curtain', nameJa: 'リネン調カーテン', nameEn: 'Linen-look curtains', specificationJa: '空間確認用の参考家具。取扱・メーカー・品番は未確認', specificationEn: 'Reference staging item; supply, maker, and SKU are not confirmed', size: 'オーダー / made to measure', colorJa: 'アイボリー（提案色）', colorEn: 'Ivory (proposed)', unitJa: '窓', unitEn: 'window', swatch: '#ddd2ba' }),
  referenceFurniture({ id: 'accessory-table', nameJa: 'ダイニングテーブル', nameEn: 'Dining table', specificationJa: '空間確認用の参考家具。取扱・メーカー・品番は未確認', specificationEn: 'Reference staging item; supply, maker, and SKU are not confirmed', size: 'W 1800 × D 850（参考）', colorJa: 'ナチュラル木目（提案色）', colorEn: 'Natural wood (proposed)', unitJa: '台', unitEn: 'ea', swatch: '#aa7b4b' }),
  referenceFurniture({ id: 'accessory-sofa', nameJa: '3人掛けソファ', nameEn: 'Three-seat sofa', specificationJa: '空間確認用の参考家具。取扱・メーカー・品番は未確認', specificationEn: 'Reference staging item; supply, maker, and SKU are not confirmed', size: 'W 2100 × D 900（参考）', colorJa: 'ウォームグレー（提案色）', colorEn: 'Warm gray (proposed)', unitJa: '台', unitEn: 'ea', swatch: '#aaa69f' }),
  referenceFurniture({ id: 'accessory-rug', nameJa: 'エリアラグ', nameEn: 'Area rug', specificationJa: '空間確認用の参考家具。取扱・メーカー・品番は未確認', specificationEn: 'Reference staging item; supply, maker, and SKU are not confirmed', size: '2000 × 2500 mm（参考）', colorJa: 'サンド（提案色）', colorEn: 'Sand (proposed)', unitJa: '枚', unitEn: 'ea', swatch: '#c8b99c' }),
  referenceFurniture({ id: 'accessory-chair', nameJa: 'ラウンジチェア', nameEn: 'Lounge chair', specificationJa: '空間確認用の参考家具。取扱・メーカー・品番は未確認', specificationEn: 'Reference staging item; supply, maker, and SKU are not confirmed', size: 'W 720 × D 780（参考）', colorJa: 'オートミール（提案色）', colorEn: 'Oatmeal (proposed)', unitJa: '脚', unitEn: 'ea', swatch: '#c7bda9' }),
  referenceFurniture({ id: 'accessory-coffee-table', nameJa: 'ローテーブル', nameEn: 'Coffee table', specificationJa: '空間確認用の参考家具。取扱・メーカー・品番は未確認', specificationEn: 'Reference staging item; supply, maker, and SKU are not confirmed', size: 'W 1100 × D 550（参考）', colorJa: 'ナチュラル木目（提案色）', colorEn: 'Natural wood (proposed)', unitJa: '台', unitEn: 'ea', swatch: '#a97b4e' }),
  referenceFurniture({ id: 'accessory-bed', nameJa: 'クイーンベッド', nameEn: 'Queen bed', specificationJa: '空間確認用の参考家具。取扱・メーカー・品番は未確認', specificationEn: 'Reference staging item; supply, maker, and SKU are not confirmed', size: 'W 1650 × D 2100（参考）', colorJa: 'ライトグレー（提案色）', colorEn: 'Light gray (proposed)', unitJa: '台', unitEn: 'ea', swatch: '#c4c2bd' }),
  referenceFurniture({ id: 'accessory-plant', nameJa: '大型観葉植物', nameEn: 'Large indoor plant', specificationJa: '空間確認用の参考アイテム。取扱・メーカー・品番は未確認', specificationEn: 'Reference staging item; supply, maker, and SKU are not confirmed', size: 'H 1500 mm（参考）', colorJa: 'グリーン（提案色）', colorEn: 'Green (proposed)', unitJa: '鉢', unitEn: 'ea', swatch: '#73876a' }),
  referenceFurniture({ id: 'accessory-dining-chairs', nameJa: 'ダイニングチェア4脚', nameEn: 'Four dining chairs', specificationJa: '空間確認用の参考家具。取扱・メーカー・品番は未確認', specificationEn: 'Reference staging item; supply, maker, and SKU are not confirmed', size: 'W 450 × D 520（参考）', colorJa: 'オーク＋ファブリック（提案色）', colorEn: 'Oak with fabric (proposed)', unitJa: '脚', unitEn: 'ea', swatch: '#bb9a6e' }),
  referenceFurniture({ id: 'accessory-tv-board', nameJa: 'TVボード', nameEn: 'TV board', specificationJa: '空間確認用の参考家具。取扱・メーカー・品番は未確認', specificationEn: 'Reference staging item; supply, maker, and SKU are not confirmed', size: 'W 1800 × D 400（参考）', colorJa: 'ウォームグレー（提案色）', colorEn: 'Warm gray (proposed)', unitJa: '台', unitEn: 'ea', swatch: '#9e9a94' }),
  referenceFurniture({ id: 'accessory-shelf', nameJa: 'オープンシェルフ', nameEn: 'Open shelving', specificationJa: '空間確認用の参考家具。取扱・メーカー・品番は未確認', specificationEn: 'Reference staging item; supply, maker, and SKU are not confirmed', size: 'W 900 × H 1800（参考）', colorJa: 'ナチュラル木目（提案色）', colorEn: 'Natural wood (proposed)', unitJa: '台', unitEn: 'ea', swatch: '#b98d5e' }),
  referenceFurniture({ id: 'accessory-floor-lamp', nameJa: 'フロアランプ', nameEn: 'Floor lamp', specificationJa: '空間確認用の参考家具。取扱・メーカー・品番は未確認', specificationEn: 'Reference staging item; supply, maker, and SKU are not confirmed', size: 'H 1600 mm（参考）', colorJa: 'ブラック＋リネンシェード（提案色）', colorEn: 'Black with linen shade (proposed)', unitJa: '台', unitEn: 'ea', swatch: '#6f6b64' }),
  referenceFurniture({ id: 'accessory-artwork', nameJa: 'アートパネル', nameEn: 'Art panel', specificationJa: '空間確認用の参考家具。取扱・メーカー・品番は未確認', specificationEn: 'Reference staging item; supply, maker, and SKU are not confirmed', size: 'W 900 × H 600（参考）', colorJa: 'モノトーン（提案）', colorEn: 'Monotone (proposed)', unitJa: '点', unitEn: 'ea', swatch: '#cfcbc4' }),
  referenceFurniture({ id: 'accessory-bedside', nameJa: 'ナイトテーブル', nameEn: 'Bedside table', specificationJa: '空間確認用の参考家具。取扱・メーカー・品番は未確認', specificationEn: 'Reference staging item; supply, maker, and SKU are not confirmed', size: 'W 450 × D 400（参考）', colorJa: 'ナチュラル木目（提案色）', colorEn: 'Natural wood (proposed)', unitJa: '台', unitEn: 'ea', swatch: '#c2a077' }),
];

export const DEFAULT_SELECTIONS: Record<SelectionSlot, string> = {
  floor: 'floor-wide-natural', walls: 'wall-vinyl-white', ceiling: 'ceiling-vinyl-white', counter: 'counter-solid-white', cabinet: 'cabinet-system-oak', backsplash: 'backsplash-panel-white', faucet: 'faucet-kitchen-mixer', sink: 'sink-system-kitchen', hardware: 'hardware-integrated-silver', lighting: 'lighting-rail-white',
};

export const DEFAULT_QUANTITIES: Record<string, number> = {
  'floor-wide-natural': 42, 'wall-vinyl-white': 118, 'ceiling-vinyl-white': 42, 'counter-solid-white': 1, 'cabinet-system-oak': 1, 'backsplash-panel-white': 1,
  'faucet-kitchen-mixer': 1, 'sink-system-kitchen': 1, 'hardware-integrated-silver': 1, 'lighting-rail-white': 1,
  'accessory-curtain': 2, 'accessory-table': 1, 'accessory-sofa': 1, 'accessory-rug': 1,
  'accessory-chair': 1, 'accessory-coffee-table': 1, 'accessory-bed': 1, 'accessory-plant': 1,
};

export const itemName = (item: CatalogItem, language: Language) => language === 'ja' ? item.nameJa : item.nameEn;
export const itemSpecification = (item: CatalogItem, language: Language) => language === 'ja' ? item.specificationJa : item.specificationEn;
export const itemColor = (item: CatalogItem, language: Language) => language === 'ja' ? item.colorJa : item.colorEn;
export const itemManufacturer = (item: CatalogItem, language: Language) => language === 'ja' ? item.manufacturerJa : item.manufacturerEn;
export const itemSource = (item: CatalogItem, language: Language) => language === 'ja' ? item.sourceJa : item.sourceEn;
export const itemUnit = (item: CatalogItem, language: Language) => language === 'ja' ? item.unitJa : item.unitEn;

export const statusLabel = (status: SpecificationStatus, language: Language) => ({
  standard: language === 'ja' ? '標準仕様' : 'Standard',
  standardPlus: language === 'ja' ? 'Standard＋' : 'Standard+',
  option: language === 'ja' ? 'オプション' : 'Option',
  reference: language === 'ja' ? '参考家具' : 'Reference furniture',
}[status]);
