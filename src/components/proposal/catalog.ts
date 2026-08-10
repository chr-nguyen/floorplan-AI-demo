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

const ASAHI_SPEC_URL = 'https://www.asahi21.co.jp/ac-mansion/shiyo.html';
const ASAHI_2LDK_URL = 'https://www.asahi21.co.jp/ac-mansion/pdf2/2ldk.pdf';
const ASAHI_PARTS_URL = 'https://www.asahi22.jp/parts_gallery/';

const POC_UNIT_PRICES: Record<string, number> = {
  'floor-wide-natural': 12800, 'floor-wide-light': 13900, 'floor-wide-dark': 16800,
  'wall-vinyl-white': 1850, 'wall-accent-greige': 2200, 'wall-accent-blue': 2450,
  'ceiling-vinyl-white': 1700, 'counter-solid-white': 198000, 'counter-solid-greige': 215000,
  'cabinet-system-white': 365000, 'cabinet-system-oak': 420000, 'cabinet-system-charcoal': 388000,
  'backsplash-panel-white': 74000, 'backsplash-panel-gray': 84000, 'faucet-kitchen-mixer': 98000,
  'sink-system-kitchen': 88000, 'hardware-integrated-silver': 42000, 'hardware-integrated-black': 48000,
  'lighting-rail-white': 85000, 'lighting-rail-black': 92000,
  'accessory-curtain': 68000, 'accessory-table': 238000, 'accessory-sofa': 328000,
  'accessory-rug': 118000, 'accessory-chair': 186000, 'accessory-coffee-table': 142000,
  'accessory-bed': 298000, 'accessory-plant': 48000,
};

const pocCode = (id: string) => `AK-POC-${id.toUpperCase().replaceAll('-', '_')}`;

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
  manufacturerJa: '朝日建設セレクト（POC）',
  manufacturerEn: 'Asahi Kensetsu Selection (POC)',
  unitPrice: item.unitPrice ?? POC_UNIT_PRICES[item.id],
  sourceJa: '朝日建設の公開仕様を基にしたPOCデータ',
  sourceEn: 'POC data based on Asahi Kensetsu public specifications',
  sourceUrl: item.sourceUrl || ASAHI_2LDK_URL,
  exactProductConfirmed: false,
});

const referenceFurniture = (item: Omit<CatalogItem, 'section' | 'manufacturerJa' | 'manufacturerEn' | 'unitPrice' | 'status' | 'sourceJa' | 'sourceEn' | 'sourceUrl' | 'exactProductConfirmed'>): CatalogItem => ({
  ...item,
  section: 'accessory',
  productCode: item.productCode || pocCode(item.id),
  manufacturerJa: '朝日建設向け家具セレクト（POC）',
  manufacturerEn: 'Furniture Selection for Asahi (POC)',
  unitPrice: POC_UNIT_PRICES[item.id],
  status: 'reference',
  sourceJa: 'ブランドを使用しないPOCサンプル家具',
  sourceEn: 'Unbranded POC sample furniture',
  sourceUrl: ASAHI_PARTS_URL,
  exactProductConfirmed: false,
});

export const CATALOG: CatalogItem[] = [
  publicItem({ id: 'floor-wide-natural', slot: 'floor', section: 'finish', nameJa: '巾広フローリング', nameEn: 'Wide-plank flooring', specificationJa: '朝日建設の公開 Standard＋仕様を基にした提案。メーカー・品番は要確認', specificationEn: 'Proposal based on Asahi Standard+ public specification; maker and SKU require confirmation', size: '巾広タイプ / wide plank', colorJa: 'ナチュラル木目（提案色）', colorEn: 'Natural wood (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#bc8d5c', status: 'standardPlus' }),
  publicItem({ id: 'floor-wide-light', slot: 'floor', section: 'finish', nameJa: '巾広フローリング', nameEn: 'Wide-plank flooring', specificationJa: '朝日建設の公開 Standard＋仕様を基にした提案。メーカー・品番は要確認', specificationEn: 'Proposal based on Asahi Standard+ public specification; maker and SKU require confirmation', size: '巾広タイプ / wide plank', colorJa: 'ライトオーク（提案色）', colorEn: 'Light oak (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#d3bd94', status: 'standardPlus' }),
  publicItem({ id: 'floor-wide-dark', slot: 'floor', section: 'finish', nameJa: '巾広フローリング', nameEn: 'Wide-plank flooring', specificationJa: '朝日建設の公開 Standard＋仕様を基にした提案。メーカー・品番は要確認', specificationEn: 'Proposal based on Asahi Standard+ public specification; maker and SKU require confirmation', size: '巾広タイプ / wide plank', colorJa: 'ダークブラウン（提案色）', colorEn: 'Dark brown (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#74513d', status: 'standardPlus' }),

  publicItem({ id: 'wall-vinyl-white', slot: 'walls', section: 'finish', nameJa: 'ビニールクロス', nameEn: 'Vinyl wallpaper', specificationJa: 'LD・洋室の公開標準仕様。メーカー・品番・防火性能は選定時に確認', specificationEn: 'Public standard for living and Western-style rooms; confirm maker, SKU, and fire rating', size: '現場採寸 / site measure', colorJa: 'ホワイト（提案色）', colorEn: 'White (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#f0eee8', status: 'standard' }),
  publicItem({ id: 'wall-accent-greige', slot: 'walls', section: 'finish', nameJa: 'アクセントクロス', nameEn: 'Accent wallpaper', specificationJa: '公開 Standard＋仕様の1面アクセントクロス。品番は要確認', specificationEn: 'One-wall accent wallpaper from the public Standard+ specification; SKU requires confirmation', size: '1面 / one wall', colorJa: 'グレージュ（提案色）', colorEn: 'Greige (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#c9c0b2', status: 'standardPlus', sourceUrl: ASAHI_SPEC_URL }),
  publicItem({ id: 'wall-accent-blue', slot: 'walls', section: 'finish', nameJa: 'アクセントクロス', nameEn: 'Accent wallpaper', specificationJa: '公開 Standard＋仕様の1面アクセントクロス。品番は要確認', specificationEn: 'One-wall accent wallpaper from the public Standard+ specification; SKU requires confirmation', size: '1面 / one wall', colorJa: 'スモークブルー（提案色）', colorEn: 'Smoke blue (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#81999e', status: 'standardPlus', sourceUrl: ASAHI_SPEC_URL }),

  publicItem({ id: 'ceiling-vinyl-white', slot: 'ceiling', section: 'finish', nameJa: '天井ビニールクロス', nameEn: 'Ceiling vinyl wallpaper', specificationJa: 'LD・洋室の公開標準仕様。メーカー・品番は要確認', specificationEn: 'Public standard for living and Western-style rooms; maker and SKU require confirmation', size: '現場採寸 / site measure', colorJa: 'ホワイト（提案色）', colorEn: 'White (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: 'm²', unitEn: 'm²', swatch: '#faf9f5', status: 'standard' }),

  publicItem({ id: 'counter-solid-white', slot: 'counter', section: 'finish', nameJa: '人造大理石カウンター', nameEn: 'Solid-surface countertop', specificationJa: '公開 Standard＋システムキッチン仕様。メーカー・寸法・品番は要確認', specificationEn: 'Public Standard+ system-kitchen specification; confirm maker, dimensions, and SKU', size: 'システムキッチン一体 / integrated', colorJa: 'ホワイト（提案色）', colorEn: 'White (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#e9e7df', status: 'standardPlus' }),
  publicItem({ id: 'counter-solid-greige', slot: 'counter', section: 'finish', nameJa: '人造大理石カウンター', nameEn: 'Solid-surface countertop', specificationJa: '公開 Standard＋システムキッチン仕様。メーカー・寸法・品番は要確認', specificationEn: 'Public Standard+ system-kitchen specification; confirm maker, dimensions, and SKU', size: 'システムキッチン一体 / integrated', colorJa: 'グレージュ（提案色）', colorEn: 'Greige (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#c6c1b8', status: 'standardPlus' }),

  publicItem({ id: 'cabinet-system-white', slot: 'cabinet', section: 'fixture', nameJa: 'システムキッチン収納', nameEn: 'System-kitchen cabinetry', specificationJa: '公開標準仕様のスライド収納。扉材・メーカー・品番は要確認', specificationEn: 'Slide storage from the public standard; confirm door finish, maker, and SKU', size: 'プランによる / per plan', colorJa: 'ホワイト（提案色）', colorEn: 'White (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#e8e6df', status: 'standard' }),
  publicItem({ id: 'cabinet-system-oak', slot: 'cabinet', section: 'fixture', nameJa: 'システムキッチン収納', nameEn: 'System-kitchen cabinetry', specificationJa: '公開標準仕様のスライド収納。扉材・メーカー・品番は要確認', specificationEn: 'Slide storage from the public standard; confirm door finish, maker, and SKU', size: 'プランによる / per plan', colorJa: 'オーク木目（提案色）', colorEn: 'Oak woodgrain (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#ad7f50', status: 'standard' }),
  publicItem({ id: 'cabinet-system-charcoal', slot: 'cabinet', section: 'fixture', nameJa: 'システムキッチン収納', nameEn: 'System-kitchen cabinetry', specificationJa: '公開標準仕様のスライド収納。扉材・メーカー・品番は要確認', specificationEn: 'Slide storage from the public standard; confirm door finish, maker, and SKU', size: 'プランによる / per plan', colorJa: 'チャコール（提案色）', colorEn: 'Charcoal (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#4e4d49', status: 'standard' }),

  publicItem({ id: 'backsplash-panel-white', slot: 'backsplash', section: 'finish', nameJa: 'キッチンパネル', nameEn: 'Kitchen panel', specificationJa: '台所の公開標準仕様。材質・メーカー・品番は要確認', specificationEn: 'Public kitchen standard; confirm material, maker, and SKU', size: '現場採寸 / site measure', colorJa: 'ホワイト（提案色）', colorEn: 'White (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#f3f2ed', status: 'standard' }),
  publicItem({ id: 'backsplash-panel-gray', slot: 'backsplash', section: 'finish', nameJa: 'キッチンパネル', nameEn: 'Kitchen panel', specificationJa: '台所の公開標準仕様。材質・メーカー・品番は要確認', specificationEn: 'Public kitchen standard; confirm material, maker, and SKU', size: '現場採寸 / site measure', colorJa: 'ライトグレー（提案色）', colorEn: 'Light gray (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#bbbcb9', status: 'standard' }),

  publicItem({ id: 'faucet-kitchen-mixer', slot: 'faucet', section: 'fixture', nameJa: 'システムキッチン水栓', nameEn: 'System-kitchen faucet', specificationJa: 'システムキッチン付属水栓。機能・メーカー・品番は要確認', specificationEn: 'Faucet supplied with the system kitchen; confirm features, maker, and SKU', size: '仕様による / per specification', colorJa: 'メタル調（提案）', colorEn: 'Metal finish (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '台', unitEn: 'ea', swatch: '#b9bdbe', status: 'standard' }),
  publicItem({ id: 'sink-system-kitchen', slot: 'sink', section: 'fixture', nameJa: 'システムキッチンシンク', nameEn: 'System-kitchen sink', specificationJa: 'システムキッチン一体。材質・寸法・メーカー・品番は要確認', specificationEn: 'Integrated with the system kitchen; confirm material, dimensions, maker, and SKU', size: '仕様による / per specification', colorJa: 'ステンレス調（提案）', colorEn: 'Stainless look (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '台', unitEn: 'ea', swatch: '#aeb5b7', status: 'standard' }),
  publicItem({ id: 'hardware-integrated-silver', slot: 'hardware', section: 'fixture', nameJa: 'キッチン扉取手', nameEn: 'Kitchen cabinet hardware', specificationJa: 'システムキッチン付属金物。形状・メーカー・品番は要確認', specificationEn: 'Hardware supplied with the system kitchen; confirm profile, maker, and SKU', size: '仕様による / per specification', colorJa: 'シルバー（提案色）', colorEn: 'Silver (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#b7b9b7', status: 'standard' }),
  publicItem({ id: 'hardware-integrated-black', slot: 'hardware', section: 'fixture', nameJa: 'キッチン扉取手', nameEn: 'Kitchen cabinet hardware', specificationJa: 'システムキッチン付属金物。形状・メーカー・品番は要確認', specificationEn: 'Hardware supplied with the system kitchen; confirm profile, maker, and SKU', size: '仕様による / per specification', colorJa: 'ブラック（提案色）', colorEn: 'Black (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#343533', status: 'standard' }),
  publicItem({ id: 'lighting-rail-white', slot: 'lighting', section: 'fixture', nameJa: 'ライティングレール＋スポットライト3灯', nameEn: 'Lighting rail with three spotlights', specificationJa: '公開 Standard＋仕様。器具メーカー・品番は要確認', specificationEn: 'Public Standard+ specification; fixture maker and SKU require confirmation', size: '3灯 / 3 lights', colorJa: 'ホワイト（提案色）', colorEn: 'White (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#f1f0eb', status: 'standardPlus' }),
  publicItem({ id: 'lighting-rail-black', slot: 'lighting', section: 'fixture', nameJa: 'ライティングレール＋スポットライト3灯', nameEn: 'Lighting rail with three spotlights', specificationJa: '公開 Standard＋仕様。器具メーカー・品番は要確認', specificationEn: 'Public Standard+ specification; fixture maker and SKU require confirmation', size: '3灯 / 3 lights', colorJa: 'ブラック（提案色）', colorEn: 'Black (proposed)', manufacturerJa: '要確認', manufacturerEn: 'To be confirmed', unitJa: '式', unitEn: 'set', swatch: '#30312f', status: 'standardPlus' }),

  referenceFurniture({ id: 'accessory-curtain', nameJa: 'リネン調カーテン', nameEn: 'Linen-look curtains', specificationJa: '空間確認用の参考家具。朝日建設の取扱・メーカー・品番は未確認', specificationEn: 'Reference staging item; Asahi supply, maker, and SKU are not confirmed', size: 'オーダー / made to measure', colorJa: 'アイボリー（提案色）', colorEn: 'Ivory (proposed)', unitJa: '窓', unitEn: 'window', swatch: '#ddd2ba' }),
  referenceFurniture({ id: 'accessory-table', nameJa: 'ダイニングテーブル', nameEn: 'Dining table', specificationJa: '空間確認用の参考家具。朝日建設の取扱・メーカー・品番は未確認', specificationEn: 'Reference staging item; Asahi supply, maker, and SKU are not confirmed', size: 'W 1800 × D 850（参考）', colorJa: 'ナチュラル木目（提案色）', colorEn: 'Natural wood (proposed)', unitJa: '台', unitEn: 'ea', swatch: '#aa7b4b' }),
  referenceFurniture({ id: 'accessory-sofa', nameJa: '3人掛けソファ', nameEn: 'Three-seat sofa', specificationJa: '空間確認用の参考家具。朝日建設の取扱・メーカー・品番は未確認', specificationEn: 'Reference staging item; Asahi supply, maker, and SKU are not confirmed', size: 'W 2100 × D 900（参考）', colorJa: 'ウォームグレー（提案色）', colorEn: 'Warm gray (proposed)', unitJa: '台', unitEn: 'ea', swatch: '#aaa69f' }),
  referenceFurniture({ id: 'accessory-rug', nameJa: 'エリアラグ', nameEn: 'Area rug', specificationJa: '空間確認用の参考家具。朝日建設の取扱・メーカー・品番は未確認', specificationEn: 'Reference staging item; Asahi supply, maker, and SKU are not confirmed', size: '2000 × 2500 mm（参考）', colorJa: 'サンド（提案色）', colorEn: 'Sand (proposed)', unitJa: '枚', unitEn: 'ea', swatch: '#c8b99c' }),
  referenceFurniture({ id: 'accessory-chair', nameJa: 'ラウンジチェア', nameEn: 'Lounge chair', specificationJa: '空間確認用の参考家具。朝日建設の取扱・メーカー・品番は未確認', specificationEn: 'Reference staging item; Asahi supply, maker, and SKU are not confirmed', size: 'W 720 × D 780（参考）', colorJa: 'オートミール（提案色）', colorEn: 'Oatmeal (proposed)', unitJa: '脚', unitEn: 'ea', swatch: '#c7bda9' }),
  referenceFurniture({ id: 'accessory-coffee-table', nameJa: 'ローテーブル', nameEn: 'Coffee table', specificationJa: '空間確認用の参考家具。朝日建設の取扱・メーカー・品番は未確認', specificationEn: 'Reference staging item; Asahi supply, maker, and SKU are not confirmed', size: 'W 1100 × D 550（参考）', colorJa: 'ナチュラル木目（提案色）', colorEn: 'Natural wood (proposed)', unitJa: '台', unitEn: 'ea', swatch: '#a97b4e' }),
  referenceFurniture({ id: 'accessory-bed', nameJa: 'クイーンベッド', nameEn: 'Queen bed', specificationJa: '空間確認用の参考家具。朝日建設の取扱・メーカー・品番は未確認', specificationEn: 'Reference staging item; Asahi supply, maker, and SKU are not confirmed', size: 'W 1650 × D 2100（参考）', colorJa: 'ライトグレー（提案色）', colorEn: 'Light gray (proposed)', unitJa: '台', unitEn: 'ea', swatch: '#c4c2bd' }),
  referenceFurniture({ id: 'accessory-plant', nameJa: '大型観葉植物', nameEn: 'Large indoor plant', specificationJa: '空間確認用の参考アイテム。朝日建設の取扱・メーカー・品番は未確認', specificationEn: 'Reference staging item; Asahi supply, maker, and SKU are not confirmed', size: 'H 1500 mm（参考）', colorJa: 'グリーン（提案色）', colorEn: 'Green (proposed)', unitJa: '鉢', unitEn: 'ea', swatch: '#73876a' }),
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
