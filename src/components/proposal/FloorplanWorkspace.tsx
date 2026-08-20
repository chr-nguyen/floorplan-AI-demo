import React, { useEffect, useRef, useState } from 'react';
import { pick, type Language } from '../i18n';
import { prepareImage, readJsonResponse, MAX_SINGLE_IMAGE_LENGTH } from './downscaleImage';
import { clearStoredFloorplan } from './floorplanImageStore';
import { countLineCrossings, hasSelfIntersection, polygonArea, splitPolygon, type FloorplanPoint } from './floorplanGeometry';
import { demoAiErrorMessage } from './demoAiErrors';
import { CATALOG } from './catalog';

export interface FloorplanRoom {
  id: string;
  nameJa: string;
  nameEn: string;
  roomType: 'kitchen' | 'living' | 'dining' | 'bathroom' | 'bedroom' | 'custom';
  polygon: Array<{ x: number; y: number }>;
  floorAreaM2: number;
  netWallAreaM2: number;
  ceilingAreaM2: number;
  roomWidthM: number;
  roomDepthM: number;
  perimeterM: number;
  confidence: 'low' | 'medium' | 'high';
  validationIssues?: string[];
}

interface FloorplanAnalysis {
  rooms: FloorplanRoom[];
  detectedDoorCount: number;
  assumedDoorWidthM: number;
  confidence: 'low' | 'medium' | 'high';
  assumptionJa: string;
  assumptionEn: string;
  scaleSource?: 'explicit-dimension' | 'door-width' | 'unknown';
  scaleEvidence?: string;
  validationIssues?: string[];
  measurementStatus?: 'unverified-ai-estimate' | 'human-reviewed';
  model?: string;
  promptVersion?: string;
}

interface Props {
  language: Language;
}

const ROOM_COLORS = ['#1f4cda', '#0f766e', '#b45309', '#7c3aed', '#be123c', '#0369a1', '#4d7c0f', '#9333ea'];
const FLOOR_MATERIALS = CATALOG.filter((item) => item.slot === 'floor');
const FLOOR_MATERIAL_GROUPS = [
  { id: 'wood', labelJa: '木質フローリング', labelEn: 'Wood flooring', items: FLOOR_MATERIALS.filter((item) => !item.id.includes('carpet') && !item.id.includes('tile')) },
  { id: 'carpet', labelJa: 'カーペット', labelEn: 'Carpet', items: FLOOR_MATERIALS.filter((item) => item.id.includes('carpet')) },
  { id: 'tile', labelJa: 'タイル・石目', labelEn: 'Tile & stone', items: FLOOR_MATERIALS.filter((item) => item.id.includes('tile')) },
];
const WALL_MATERIALS = CATALOG.filter((item) => item.slot === 'walls');
const WALL_MATERIAL_GROUPS = [
  { id: 'base', labelJa: 'ベースクロス', labelEn: 'Base wallcovering', items: WALL_MATERIALS.filter((item) => item.id.includes('vinyl')) },
  { id: 'accent', labelJa: 'アクセントクロス', labelEn: 'Accent wallcovering', items: WALL_MATERIALS.filter((item) => item.id.includes('accent')) },
  { id: 'panel', labelJa: '木質パネル', labelEn: 'Wood panel', items: WALL_MATERIALS.filter((item) => item.id.includes('panel')) },
];
const FLOOR_TEXTURE_MODULES: Record<string, { widthM: number; lengthM: number; label: string }> = {
  'floor-wide-natural': { widthM: 0.12, lengthM: 0.9, label: '120 × 900 mm plank' },
  'floor-wide-light': { widthM: 0.12, lengthM: 0.9, label: '120 × 900 mm plank' },
  'floor-wide-dark': { widthM: 0.12, lengthM: 0.9, label: '120 × 900 mm plank' },
  'floor-wide-greige': { widthM: 0.12, lengthM: 0.9, label: '120 × 900 mm plank' },
  'floor-herringbone-oak': { widthM: 0.09, lengthM: 0.45, label: '90 × 450 mm herringbone piece' },
  'floor-carpet-warm-beige': { widthM: 0.5, lengthM: 0.5, label: '500 × 500 mm carpet tile' },
  'floor-carpet-greige': { widthM: 0.5, lengthM: 0.5, label: '500 × 500 mm carpet tile' },
  'floor-carpet-charcoal': { widthM: 0.5, lengthM: 0.5, label: '500 × 500 mm carpet tile' },
  'floor-carpet-muted-blue': { widthM: 0.5, lengthM: 0.5, label: '500 × 500 mm carpet tile' },
  'floor-carpet-sage': { widthM: 0.5, lengthM: 0.5, label: '500 × 500 mm carpet tile' },
  'floor-tile-stone': { widthM: 0.3, lengthM: 0.3, label: '300 × 300 mm tile' },
  'floor-tile-ivory': { widthM: 0.3, lengthM: 0.3, label: '300 × 300 mm tile' },
  'floor-tile-sand': { widthM: 0.3, lengthM: 0.3, label: '300 × 300 mm tile' },
  'floor-tile-concrete': { widthM: 0.3, lengthM: 0.3, label: '300 × 300 mm tile' },
  'floor-tile-slate': { widthM: 0.3, lengthM: 0.3, label: '300 × 300 mm tile' },
  'floor-tile-terrazzo': { widthM: 0.3, lengthM: 0.3, label: '300 × 300 mm tile' },
  'floor-tile-sage': { widthM: 0.3, lengthM: 0.3, label: '300 × 300 mm tile' },
};
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const FLOORPLAN_STORAGE_KEY = 'archix-floorplan-workspace-v1';
const LEGACY_FLOORPLAN_IMAGE_KEY = 'archix-floorplan-image-v1';

type Point = FloorplanPoint;
type GeometryTool = 'draw-room' | 'split-room';
type FloorplanRenderStyle = 'watercolor' | 'soft-marker' | 'japanese-brochure' | '3d-render' | 'photorealistic' | 'photo-dollhouse';
type FloorplanView = 'plan' | 'render';

const RENDER_STYLES: Array<{ id: FloorplanRenderStyle; number: string; ja: string; en: string; detailJa: string; detailEn: string }> = [
  { id: 'watercolor', number: '01', ja: '建築水彩', en: 'Architectural watercolor', detailJa: '透明感のある平面図', detailEn: 'Transparent top-down washes' },
  { id: 'soft-marker', number: '02', ja: 'ソフトマーカー', en: 'Soft marker plan', detailJa: '手描きマーカー仕上げ', detailEn: 'Hand-rendered marker finish' },
  { id: 'japanese-brochure', number: '03', ja: '日本向け販売図面', en: 'Japanese sales brochure', detailJa: '明るく読みやすい販売用', detailEn: 'Bright, legible sales plan' },
  { id: '3d-render', number: '04', ja: '3Dアイソメ', en: '3D isometric', detailJa: '建物全体の立体切断図', detailEn: 'Complete cutaway model' },
  { id: 'photorealistic', number: '05', ja: 'マテリアルアイソメ', en: 'Material isometric', detailJa: '素材感を重視したCG表現', detailEn: 'Polished material-focused CG' },
  { id: 'photo-dollhouse', number: '06', ja: 'フォトリアル・ドールハウス', en: 'Photoreal dollhouse', detailJa: '実写感を優先した立体図', detailEn: 'Photography-led cutaway' },
];

const defaultFloorMaterialId = (room: FloorplanRoom) => {
  const searchableName = `${room.nameJa} ${room.nameEn}`.toLowerCase();
  if (room.roomType === 'bathroom' || /bath|toilet|wash|laundry|浴|洗面|便所|トイレ/.test(searchableName)) return 'floor-tile-ivory';
  if (room.roomType === 'kitchen' || /kitchen|pantry|キッチン|台所/.test(searchableName)) return 'floor-tile-stone';
  if (/entry|entrance|genkan|玄関|土間/.test(searchableName)) return 'floor-tile-sand';
  if (room.roomType === 'bedroom' || /bed|寝室|洋室/.test(searchableName)) return 'floor-carpet-greige';
  if (room.roomType === 'dining') return 'floor-herringbone-oak';
  if (room.roomType === 'living') return 'floor-wide-natural';
  return 'floor-wide-natural';
};

const defaultWallMaterialId = (room: FloorplanRoom) => {
  const searchableName = `${room.nameJa} ${room.nameEn}`.toLowerCase();
  if (room.roomType === 'bathroom' || /bath|toilet|wash|laundry|浴|洗面|便所|トイレ/.test(searchableName)) return 'wall-vinyl-white';
  if (room.roomType === 'kitchen' || /kitchen|pantry|キッチン|台所/.test(searchableName)) return 'wall-vinyl-white';
  if (/entry|entrance|genkan|玄関|土間/.test(searchableName)) return 'wall-accent-greige';
  if (room.roomType === 'bedroom' || /bed|寝室|洋室/.test(searchableName)) return 'wall-accent-sage';
  if (room.roomType === 'dining') return 'wall-accent-greige';
  if (room.roomType === 'living') return 'wall-vinyl-warm-white';
  return 'wall-vinyl-warm-white';
};

const isCriticalValidationIssue = (issue: string) => /missing|degenerate|self-intersect/i.test(issue);

export default function FloorplanWorkspace({ language }: Props) {
  const [imageUrl, setImageUrl] = useState<string>();
  const [imageData, setImageData] = useState<string>();
  const [fileName, setFileName] = useState<string>();
  const [doorWidth, setDoorWidth] = useState(0.8);
  const [analysis, setAnalysis] = useState<FloorplanAnalysis>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [dragActive, setDragActive] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
  const [renderImageSize, setRenderImageSize] = useState<{ width: number; height: number }>();
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const [zoom, setZoom] = useState(1);
  const [editingRoomId, setEditingRoomId] = useState<string>();
  const [calibrationMode, setCalibrationMode] = useState(false);
  const [calibrationPoints, setCalibrationPoints] = useState<Point[]>([]);
  const [calibrationLengthM, setCalibrationLengthM] = useState(1);
  const [manualPixelsPerMeter, setManualPixelsPerMeter] = useState<number>();
  const [outlineNeedsCalibration, setOutlineNeedsCalibration] = useState(false);
  const [geometryTool, setGeometryTool] = useState<GeometryTool>();
  const [drawPoints, setDrawPoints] = useState<Point[]>([]);
  const [splitRoomId, setSplitRoomId] = useState<string>();
  const [splitPoints, setSplitPoints] = useState<Point[]>([]);
  const [geometryError, setGeometryError] = useState<string>();
  const [renamingRoomId, setRenamingRoomId] = useState<string>();
  const [renameDraft, setRenameDraft] = useState('');
  const [renameError, setRenameError] = useState<string>();
  const [roomFloorMaterials, setRoomFloorMaterials] = useState<Record<string, string>>({});
  const [roomWallMaterials, setRoomWallMaterials] = useState<Record<string, string>>({});
  const [renderStyle, setRenderStyle] = useState<FloorplanRenderStyle>('watercolor');
  const [floorplanView, setFloorplanView] = useState<FloorplanView>('plan');
  const [renderedFloorplan, setRenderedFloorplan] = useState<string>();
  const [renderingFloorplan, setRenderingFloorplan] = useState(false);
  const [floorplanRenderError, setFloorplanRenderError] = useState<string>();
  const [floorplanRenderStale, setFloorplanRenderStale] = useState(false);
  const [textureScalePercent, setTextureScalePercent] = useState(100);
  const inputRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const panRef = useRef<Point>({ x: 0, y: 0 });
  const zoomFrameRef = useRef<number>();
  const pointFrameRef = useRef<number>();
  const pendingPointRef = useRef<{ roomId: string; pointIndex: number; client: Point }>();
  const handleRectRef = useRef<DOMRect>();
  const objectUrlRef = useRef<string>();
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef({ startDistance: 0, startZoom: 1, startMidpoint: { x: 0, y: 0 }, startPan: { x: 0, y: 0 }, dragStart: { x: 0, y: 0 }, viewportRect: undefined as DOMRect | undefined });
  const movedRef = useRef(false);
  const analysisInFlightRef = useRef(false);
  const renderInFlightRef = useRef(false);
  const t = (ja: string, en: string) => pick(language, ja, en);
  const criticalAnalysisIssues = (analysis?.validationIssues || []).filter(isCriticalValidationIssue);

  const cancelGeometryTool = () => {
    setGeometryTool(undefined);
    setDrawPoints([]);
    setSplitRoomId(undefined);
    setSplitPoints([]);
    setGeometryError(undefined);
  };

  const cancelRoomRename = () => {
    setRenamingRoomId(undefined);
    setRenameDraft('');
    setRenameError(undefined);
  };

  const activeImageUrl = floorplanView === 'render' && renderedFloorplan ? renderedFloorplan : imageUrl;
  const activeImageSize = floorplanView === 'render' && renderedFloorplan ? renderImageSize || imageSize : imageSize;
  const fitScale = Math.min(viewportSize.width / activeImageSize.width, viewportSize.height / activeImageSize.height);
  const fittedSize = {
    width: Math.max(1, activeImageSize.width * fitScale),
    height: Math.max(1, activeImageSize.height * fitScale),
  };

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_FLOORPLAN_IMAGE_KEY);
      localStorage.removeItem(FLOORPLAN_STORAGE_KEY);
    } catch {
      // Storage can be unavailable; the floorplan workspace is still session-only.
    }
    void clearStoredFloorplan();
  }, []);

  useEffect(() => {
    setRenamingRoomId(undefined);
    setRenameDraft('');
    setRenameError(undefined);
  }, [language]);

  useEffect(() => () => {
    if (zoomFrameRef.current !== undefined) cancelAnimationFrame(zoomFrameRef.current);
    if (pointFrameRef.current !== undefined) cancelAnimationFrame(pointFrameRef.current);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const updateSize = () => {
      const rect = viewport.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      setViewportSize({ width: rect.width, height: rect.height });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [activeImageUrl, loading, renderingFloorplan]);

  const clampPan = (nextPan: Point, nextZoom: number): Point => {
    const maxX = Math.max(0, (fittedSize.width * nextZoom - viewportSize.width) / 2);
    const maxY = Math.max(0, (fittedSize.height * nextZoom - viewportSize.height) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, nextPan.x)),
      y: Math.max(-maxY, Math.min(maxY, nextPan.y)),
    };
  };

  const applyTransform = () => {
    const canvas = canvasRef.current;
    if (canvas) canvas.style.transform = `translate3d(${panRef.current.x}px, ${panRef.current.y}px, 0) scale(${zoomRef.current})`;
  };

  const commitTransform = (nextZoom: number, nextPan: Point) => {
    const boundedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
    zoomRef.current = boundedZoom;
    panRef.current = clampPan(nextPan, boundedZoom);
    applyTransform();
    if (zoomFrameRef.current === undefined) {
      zoomFrameRef.current = requestAnimationFrame(() => {
        zoomFrameRef.current = undefined;
        setZoom(zoomRef.current);
      });
    }
  };

  const resetView = () => commitTransform(1, { x: 0, y: 0 });

  const zoomAt = (nextZoom: number, clientPoint?: Point) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    const currentZoom = zoomRef.current;
    const boundedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
    const focus = rect && clientPoint
      ? { x: clientPoint.x - (rect.left + rect.width / 2), y: clientPoint.y - (rect.top + rect.height / 2) }
      : { x: 0, y: 0 };
    const ratio = boundedZoom / currentZoom;
    commitTransform(boundedZoom, {
      x: focus.x - (focus.x - panRef.current.x) * ratio,
      y: focus.y - (focus.y - panRef.current.y) * ratio,
    });
  };

  useEffect(() => {
    if (!activeImageUrl) return;
    commitTransform(zoomRef.current, panRef.current);
  // Re-clamp after the viewport or fitted image dimensions change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeImageUrl, loading, renderingFloorplan, viewportSize.width, viewportSize.height, activeImageSize.width, activeImageSize.height]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !activeImageUrl) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAt(zoomRef.current * Math.exp(-event.deltaY * 0.0015), { x: event.clientX, y: event.clientY });
    };
    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeImageUrl, loading, renderingFloorplan, viewportSize.width, viewportSize.height, fittedSize.width, fittedSize.height]);

  const loadFloorplan = (file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError(t('PNG または JPEG の平面図を選択してください。', 'Choose a PNG or JPEG floorplan.'));
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError(t('画像は12MB以下にしてください。', 'The image must be 12 MB or smaller.'));
      return;
    }
    void prepareImage(file, { maxEdge: 3000, jpegQuality: 0.95, preservePng: true, maxLength: MAX_SINGLE_IMAGE_LENGTH }).then((data) => {
      const nextUrl = URL.createObjectURL(file);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = nextUrl;
      setImageUrl(nextUrl);
      setImageData(data);
      setFileName(file.name);
      setAnalysis(undefined);
      setRoomFloorMaterials({});
      setRoomWallMaterials({});
      setRenderedFloorplan(undefined);
      setFloorplanView('plan');
      setFloorplanRenderStale(false);
      setFloorplanRenderError(undefined);
      setRenderImageSize(undefined);
      setEditingRoomId(undefined);
      setCalibrationMode(false);
      setCalibrationPoints([]);
      setManualPixelsPerMeter(undefined);
      setOutlineNeedsCalibration(false);
      cancelGeometryTool();
      cancelRoomRename();
      setImageSize({ width: 1, height: 1 });
      zoomRef.current = 1;
      panRef.current = { x: 0, y: 0 };
      applyTransform();
      setZoom(1);
      setError(undefined);
    }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : t('平面図を読み込めませんでした。', 'The floorplan could not be loaded.')));
  };

  const analyzeFloorplan = async () => {
    if (!imageData || analysisInFlightRef.current) return;
    analysisInFlightRef.current = true;
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch('/api/analyze-floorplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ floorplan: imageData, standardDoorWidthM: doorWidth }),
      });
      const payload = await readJsonResponse(response);
      if (!response.ok || !payload.analysis?.rooms?.length) throw new Error(payload.error || 'No rooms were detected.');
      const nextAnalysis = { ...payload.analysis, model: payload.model, promptVersion: payload.promptVersion } as FloorplanAnalysis;
      setAnalysis(nextAnalysis);
      setRoomFloorMaterials(Object.fromEntries(nextAnalysis.rooms.map((room) => [room.id, defaultFloorMaterialId(room)])));
      setRoomWallMaterials(Object.fromEntries(nextAnalysis.rooms.map((room) => [room.id, defaultWallMaterialId(room)])));
      setRenderedFloorplan(undefined);
      setFloorplanView('plan');
      setFloorplanRenderStale(false);
      setFloorplanRenderError(undefined);
      setEditingRoomId(undefined);
      setCalibrationMode(false);
      setCalibrationPoints([]);
      setManualPixelsPerMeter(undefined);
      setOutlineNeedsCalibration(false);
      cancelGeometryTool();
      cancelRoomRename();
    } catch (analysisError) {
      setError(demoAiErrorMessage(analysisError, language, 'floorplan'));
    } finally {
      analysisInFlightRef.current = false;
      setLoading(false);
    }
  };

  const selectRoomFloorMaterial = (roomId: string, materialId: string) => {
    setRoomFloorMaterials((current) => ({ ...current, [roomId]: materialId }));
    setFloorplanRenderError(undefined);
    setFloorplanView('plan');
    if (renderedFloorplan) setFloorplanRenderStale(true);
  };

  const selectRoomWallMaterial = (roomId: string, materialId: string) => {
    setRoomWallMaterials((current) => ({ ...current, [roomId]: materialId }));
    setFloorplanRenderError(undefined);
    if (renderedFloorplan) setFloorplanRenderStale(true);
  };

  const chooseRenderStyle = (style: FloorplanRenderStyle) => {
    setRenderStyle(style);
    setFloorplanRenderError(undefined);
    if (renderedFloorplan) setFloorplanRenderStale(true);
  };

  const changeTextureScale = (value: number) => {
    setTextureScalePercent(Math.max(50, Math.min(200, value)));
    setFloorplanRenderError(undefined);
    if (renderedFloorplan) setFloorplanRenderStale(true);
  };

  const autoAssignMaterials = () => {
    if (!analysis) return;
    setRoomFloorMaterials(Object.fromEntries(analysis.rooms.map((room) => [room.id, defaultFloorMaterialId(room)])));
    setRoomWallMaterials(Object.fromEntries(analysis.rooms.map((room) => [room.id, defaultWallMaterialId(room)])));
    setFloorplanView('plan');
    setFloorplanRenderError(undefined);
    if (renderedFloorplan) setFloorplanRenderStale(true);
  };

  const showFloorplanView = (view: FloorplanView) => {
    if (view === 'render' && !renderedFloorplan) return;
    cancelGeometryTool();
    cancelRoomRename();
    setEditingRoomId(undefined);
    setCalibrationMode(false);
    setCalibrationPoints([]);
    setFloorplanView(view);
    window.requestAnimationFrame(resetView);
  };

  const renderColorFloorplan = async () => {
    if (!imageData || !analysis || renderInFlightRef.current) return;
    const scheduledRooms = analysis.rooms.map((room) => ({
      room,
      material: FLOOR_MATERIALS.find((item) => item.id === roomFloorMaterials[room.id]),
      wall: WALL_MATERIALS.find((item) => item.id === roomWallMaterials[room.id]),
    }));
    if (scheduledRooms.some(({ material, wall }) => !material || !wall)) {
      setFloorplanRenderError(t('すべての部屋に床材と壁材を選択してください。', 'Choose a floor and a wall material for every room.'));
      return;
    }

    renderInFlightRef.current = true;
    setRenderingFloorplan(true);
    setFloorplanRenderError(undefined);
    try {
      const response = await fetch('/api/generate-floorplan-color-render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          floorplan: imageData,
          style: renderStyle,
          doorWidthM: analysis.assumedDoorWidthM || doorWidth,
          textureScalePercent,
          rooms: scheduledRooms.map(({ room, material, wall }) => {
            const textureGeometry = roomTextureGeometry(room, material!.id);
            return {
              name: language === 'ja' ? room.nameJa : room.nameEn,
              materialName: language === 'ja' ? material!.nameJa : material!.nameEn,
              materialColor: language === 'ja' ? material!.colorJa : material!.colorEn,
              specification: language === 'ja' ? material!.specificationJa : material!.specificationEn,
              wallMaterialName: language === 'ja' ? wall!.nameJa : wall!.nameEn,
              wallMaterialColor: language === 'ja' ? wall!.colorJa : wall!.colorEn,
              wallSpecification: language === 'ja' ? wall!.specificationJa : wall!.specificationEn,
              wallSwatchHex: wall!.swatch,
              wallIsAccent: wall!.id.includes('accent') || wall!.id.includes('panel'),
              textureModule: FLOOR_TEXTURE_MODULES[material!.id]?.label || material!.size,
              moduleWidthM: FLOOR_TEXTURE_MODULES[material!.id]?.widthM,
              moduleLengthM: FLOOR_TEXTURE_MODULES[material!.id]?.lengthM,
              patternAngleDeg: textureGeometry.angle,
              alignmentRule: material!.id.includes('tile') ? 'centered grid aligned to the longest room wall' : 'long direction aligned to the longest room wall',
              polygon: room.polygon,
            };
          }),
        }),
      });
      const payload = await readJsonResponse(response);
      if (!response.ok || !payload.image) throw new Error(payload.error || 'The reconstructed floorplan was not returned.');
      setRenderedFloorplan(payload.image);
      setRenderImageSize(undefined);
      setFloorplanRenderStale(false);
      setFloorplanView('render');
      zoomRef.current = 1;
      panRef.current = { x: 0, y: 0 };
      applyTransform();
      setZoom(1);
    } catch (renderError) {
      setFloorplanRenderError(demoAiErrorMessage(renderError, language, 'preview'));
    } finally {
      renderInFlightRef.current = false;
      setRenderingFloorplan(false);
    }
  };

  const beginRoomRename = (room: FloorplanRoom) => {
    cancelGeometryTool();
    setEditingRoomId(undefined);
    setCalibrationMode(false);
    setCalibrationPoints([]);
    setRenamingRoomId(room.id);
    setRenameDraft(language === 'ja' ? room.nameJa : room.nameEn);
    setRenameError(undefined);
  };

  const saveRoomRename = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!renamingRoomId) return;
    const name = renameDraft.trim();
    if (!name) {
      setRenameError(t('部屋名を入力してください。', 'Enter a room name.'));
      return;
    }
    setAnalysis((current) => current ? {
      ...current,
      rooms: current.rooms.map((room) => room.id === renamingRoomId
        ? { ...room, ...(language === 'ja' ? { nameJa: name } : { nameEn: name }) }
        : room),
    } : current);
    if (renderedFloorplan) setFloorplanRenderStale(true);
    cancelRoomRename();
  };

  const pointFromRect = (rect: DOMRect, clientX: number, clientY: number): Point => ({
    x: Math.max(0, Math.min(100, (clientX - rect.left) / rect.width * 100)),
    y: Math.max(0, Math.min(100, (clientY - rect.top) / rect.height * 100)),
  });

  const svgRectOf = (element: SVGElement) => (element.ownerSVGElement || element as SVGSVGElement).getBoundingClientRect();

  const pointFromEvent = (event: React.PointerEvent<SVGElement> | React.MouseEvent<SVGElement>): Point =>
    pointFromRect(svgRectOf(event.currentTarget), event.clientX, event.clientY);

  const recalculateRooms = (rooms: FloorplanRoom[], pixelsPerMeter: number, onlyRoomId?: string) => rooms.map((room) => {
    if (onlyRoomId && room.id !== onlyRoomId) return room;
    const pixelPoints = room.polygon.map((point) => ({ x: point.x / 100 * imageSize.width, y: point.y / 100 * imageSize.height }));
    const twiceArea = pixelPoints.reduce((sum, point, index) => {
      const next = pixelPoints[(index + 1) % pixelPoints.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0);
    const perimeterPx = pixelPoints.reduce((sum, point, index) => {
      const next = pixelPoints[(index + 1) % pixelPoints.length];
      return sum + Math.hypot(next.x - point.x, next.y - point.y);
    }, 0);
    const xs = pixelPoints.map((point) => point.x);
    const ys = pixelPoints.map((point) => point.y);
    const floorAreaM2 = Math.max(0.5, Math.abs(twiceArea) / 2 / (pixelsPerMeter ** 2));
    const perimeterM = Math.max(2, perimeterPx / pixelsPerMeter);
    const openingFactor = Math.max(0.55, Math.min(1, room.netWallAreaM2 / Math.max(1, room.perimeterM * 2.4)));
    return {
      ...room,
      floorAreaM2: Math.round(floorAreaM2 * 10) / 10,
      ceilingAreaM2: Math.round(floorAreaM2 * 10) / 10,
      perimeterM: Math.round(perimeterM * 10) / 10,
      netWallAreaM2: Math.round(perimeterM * 2.4 * openingFactor * 10) / 10,
      roomWidthM: Math.round((Math.max(...xs) - Math.min(...xs)) / pixelsPerMeter * 10) / 10,
      roomDepthM: Math.round((Math.max(...ys) - Math.min(...ys)) / pixelsPerMeter * 10) / 10,
      confidence: (room.validationIssues?.length ? 'low' : 'medium') as 'low' | 'medium',
    };
  });

  const inferPixelsPerMeter = (rooms: FloorplanRoom[]) => {
    const candidates = rooms.flatMap((room) => {
      if (room.floorAreaM2 <= 0 || room.polygon.length < 3) return [];
      const pixelPolygon = room.polygon.map((point) => ({ x: point.x / 100 * imageSize.width, y: point.y / 100 * imageSize.height }));
      const inferred = Math.sqrt(polygonArea(pixelPolygon) / room.floorAreaM2);
      return Number.isFinite(inferred) && inferred > 0 ? [inferred] : [];
    }).sort((a, b) => a - b);
    if (!candidates.length) return undefined;
    const middle = Math.floor(candidates.length / 2);
    return candidates.length % 2 ? candidates[middle] : (candidates[middle - 1] + candidates[middle]) / 2;
  };

  const beginDrawRoom = () => {
    cancelRoomRename();
    setGeometryTool('draw-room');
    setDrawPoints([]);
    setSplitRoomId(undefined);
    setSplitPoints([]);
    setGeometryError(undefined);
    setEditingRoomId(undefined);
    setCalibrationMode(false);
    setCalibrationPoints([]);
  };

  const beginSplitRoom = (roomId: string) => {
    cancelRoomRename();
    setGeometryTool('split-room');
    setSplitRoomId(roomId);
    setSplitPoints([]);
    setDrawPoints([]);
    setGeometryError(undefined);
    setEditingRoomId(undefined);
    setCalibrationMode(false);
    setCalibrationPoints([]);
  };

  const handleGeometryPoint = (event: React.MouseEvent<SVGRectElement>) => {
    event.stopPropagation();
    const point = pointFromEvent(event);
    setGeometryError(undefined);
    if (geometryTool === 'draw-room') setDrawPoints((current) => [...current, point]);
    if (geometryTool === 'split-room') setSplitPoints((current) => current.length >= 2 ? [point] : [...current, point]);
  };

  const finishDrawnRoom = () => {
    if (!analysis || drawPoints.length < 3) return;
    if (polygonArea(drawPoints) < 0.02) {
      setGeometryError(t('部屋の輪郭が小さすぎます。点を離して描き直してください。', 'The room outline is too small. Redraw it with points farther apart.'));
      return;
    }
    if (hasSelfIntersection(drawPoints)) {
      setGeometryError(t('輪郭線が交差しています。交差しない順番で点を配置してください。', 'The outline crosses itself. Place the points in a non-crossing order.'));
      return;
    }
    const nextId = `user-room-${Date.now()}`;
    const roomNumber = analysis.rooms.filter((room) => room.id.startsWith('user-room-')).length + 1;
    const geometryIssue = 'User-drawn room: verify boundaries and measurements.';
    const draftRoom: FloorplanRoom = {
      id: nextId,
      nameJa: `新規室 ${roomNumber}`,
      nameEn: `New room ${roomNumber}`,
      roomType: 'custom',
      polygon: drawPoints,
      floorAreaM2: 0.5,
      ceilingAreaM2: 0.5,
      netWallAreaM2: 2.4,
      roomWidthM: 0.5,
      roomDepthM: 0.5,
      perimeterM: 1,
      confidence: 'low',
      validationIssues: [geometryIssue],
    };
    const pixelsPerMeter = manualPixelsPerMeter || inferPixelsPerMeter(analysis.rooms);
    if (!pixelsPerMeter) {
      setGeometryError(t('面積を計算する縮尺がありません。先に縮尺を補正してください。', 'No usable scale is available for area calculation. Calibrate the scale first.'));
      return;
    }
    const nextRoom = recalculateRooms([draftRoom], pixelsPerMeter)[0];
    setAnalysis({
      ...analysis,
      rooms: [...analysis.rooms, nextRoom],
      confidence: 'low',
      measurementStatus: 'unverified-ai-estimate',
      validationIssues: [...new Set([...(analysis.validationIssues || []), geometryIssue])],
    });
    setRoomFloorMaterials((current) => ({ ...current, [nextId]: defaultFloorMaterialId(nextRoom) }));
    setRoomWallMaterials((current) => ({ ...current, [nextId]: defaultWallMaterialId(nextRoom) }));
    if (renderedFloorplan) setFloorplanRenderStale(true);
    if (!manualPixelsPerMeter) setOutlineNeedsCalibration(true);
    cancelGeometryTool();
  };

  const finishRoomSplit = () => {
    if (!analysis || !splitRoomId || splitPoints.length !== 2) return;
    const sourceRoom = analysis.rooms.find((room) => room.id === splitRoomId);
    if (!sourceRoom) return;
    if (Math.hypot(splitPoints[1].x - splitPoints[0].x, splitPoints[1].y - splitPoints[0].y) < 0.5) {
      setGeometryError(t('分割線が短すぎます。部屋を横切る2点を選択してください。', 'The split line is too short. Pick two points across the room.'));
      return;
    }
    if (countLineCrossings(sourceRoom.polygon, splitPoints[0], splitPoints[1]) !== 2) {
      setGeometryError(t('分割線は部屋の境界とちょうど2回交差する必要があります。線の位置を調整してください。', 'The split line must cross the room boundary exactly twice. Adjust the line position.'));
      return;
    }
    const [firstPolygon, secondPolygon] = splitPolygon(sourceRoom.polygon, splitPoints[0], splitPoints[1]);
    const minimumPartArea = Math.max(0.02, polygonArea(sourceRoom.polygon) * 0.03);
    if (firstPolygon.length < 3 || secondPolygon.length < 3 || polygonArea(firstPolygon) < minimumPartArea || polygonArea(secondPolygon) < minimumPartArea) {
      setGeometryError(t('分割線が部屋を十分に横切っていません。別の2点を選択してください。', 'The split line does not cross enough of the room. Choose two different points.'));
      return;
    }
    const nextId = `${sourceRoom.id}-part-${Date.now()}`;
    const geometryIssue = 'User-created subdivision: verify the split boundary and measurements.';
    const sourceIssues = [...new Set([...(sourceRoom.validationIssues || []), geometryIssue])];
    const firstRoom: FloorplanRoom = { ...sourceRoom, nameJa: `${sourceRoom.nameJa} A`, nameEn: `${sourceRoom.nameEn} A`, polygon: firstPolygon, confidence: 'low', validationIssues: sourceIssues };
    const secondRoom: FloorplanRoom = { ...sourceRoom, id: nextId, nameJa: `${sourceRoom.nameJa} B`, nameEn: `${sourceRoom.nameEn} B`, polygon: secondPolygon, confidence: 'low', validationIssues: sourceIssues };
    const pixelsPerMeter = manualPixelsPerMeter || inferPixelsPerMeter(analysis.rooms);
    if (!pixelsPerMeter) {
      setGeometryError(t('面積を計算する縮尺がありません。先に縮尺を補正してください。', 'No usable scale is available for area calculation. Calibrate the scale first.'));
      return;
    }
    const [recalculatedFirst, recalculatedSecond] = recalculateRooms([firstRoom, secondRoom], pixelsPerMeter);
    const sourceIndex = analysis.rooms.findIndex((room) => room.id === sourceRoom.id);
    const nextRooms = [...analysis.rooms];
    nextRooms.splice(sourceIndex, 1, recalculatedFirst, recalculatedSecond);
    setAnalysis({
      ...analysis,
      rooms: nextRooms,
      confidence: 'low',
      measurementStatus: 'unverified-ai-estimate',
      validationIssues: [...new Set([...(analysis.validationIssues || []), geometryIssue])],
    });
    setRoomFloorMaterials((current) => ({ ...current, [nextId]: current[sourceRoom.id] || defaultFloorMaterialId(sourceRoom) }));
    setRoomWallMaterials((current) => ({ ...current, [nextId]: current[sourceRoom.id] || defaultWallMaterialId(sourceRoom) }));
    if (renderedFloorplan) setFloorplanRenderStale(true);
    if (!manualPixelsPerMeter) setOutlineNeedsCalibration(true);
    cancelGeometryTool();
  };

  const applyManualCalibration = () => {
    if (!analysis || calibrationPoints.length !== 2 || calibrationLengthM <= 0) return;
    const [start, end] = calibrationPoints;
    const pixelDistance = Math.hypot((end.x - start.x) / 100 * imageSize.width, (end.y - start.y) / 100 * imageSize.height);
    const pixelsPerMeter = pixelDistance / calibrationLengthM;
    if (!Number.isFinite(pixelsPerMeter) || pixelsPerMeter <= 0) return;
    const rooms = recalculateRooms(analysis.rooms, pixelsPerMeter);
    setAnalysis({
      ...analysis,
      rooms,
      confidence: rooms.some((room) => room.validationIssues?.length) ? 'low' : 'medium',
      measurementStatus: 'unverified-ai-estimate',
      assumptionJa: `図面上の2点間 ${calibrationLengthM.toFixed(2)}m で手動縮尺補正。面積は現場採寸で最終確認してください。`,
      assumptionEn: `Manually calibrated from a ${calibrationLengthM.toFixed(2)} m two-point reference. Verify final areas on site.`,
    });
    if (renderedFloorplan) setFloorplanRenderStale(true);
    setManualPixelsPerMeter(pixelsPerMeter);
    setOutlineNeedsCalibration(false);
    setCalibrationMode(false);
    setCalibrationPoints([]);
  };

  const updatePolygonPoint = (roomId: string, pointIndex: number, point: Point) => {
    setAnalysis((current) => {
      if (!current) return current;
      let rooms = current.rooms.map((room) => room.id === roomId
        ? { ...room, polygon: room.polygon.map((candidate, index) => index === pointIndex ? point : candidate) }
        : room);
      if (manualPixelsPerMeter) rooms = recalculateRooms(rooms, manualPixelsPerMeter, roomId);
      return { ...current, rooms };
    });
    if (!manualPixelsPerMeter) setOutlineNeedsCalibration(true);
    if (renderedFloorplan) setFloorplanRenderStale(true);
  };

  const queuePolygonPoint = (roomId: string, pointIndex: number, client: Point) => {
    pendingPointRef.current = { roomId, pointIndex, client };
    if (pointFrameRef.current !== undefined) return;
    pointFrameRef.current = requestAnimationFrame(() => {
      pointFrameRef.current = undefined;
      const pending = pendingPointRef.current;
      const rect = handleRectRef.current;
      if (pending && rect) updatePolygonPoint(pending.roomId, pending.pointIndex, pointFromRect(rect, pending.client.x, pending.client.y));
    });
  };

  const midpoint = (points: Point[]) => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
  const distance = (points: Point[]) => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);

  const captureActivePointers = (element: HTMLDivElement) => pointersRef.current.forEach((_, pointerId) => {
    if (!element.hasPointerCapture(pointerId)) element.setPointerCapture(pointerId);
  });

  const startPointerGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!activeImageUrl || event.button > 0) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    movedRef.current = false;
    gestureRef.current.viewportRect = viewportRef.current?.getBoundingClientRect();
    const points = [...pointersRef.current.values()];
    if (points.length === 1) {
      gestureRef.current.dragStart = points[0];
      gestureRef.current.startPan = panRef.current;
    } else if (points.length === 2) {
      captureActivePointers(event.currentTarget);
      gestureRef.current.startDistance = distance(points);
      gestureRef.current.startZoom = zoomRef.current;
      gestureRef.current.startMidpoint = midpoint(points);
      gestureRef.current.startPan = panRef.current;
    }
  };

  const movePointerGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointersRef.current.values()];
    if (points.length >= 2) {
      const currentMidpoint = midpoint(points);
      const start = gestureRef.current;
      const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, start.startZoom * distance(points) / Math.max(1, start.startDistance)));
      const rect = start.viewportRect;
      const focus = rect
        ? { x: start.startMidpoint.x - (rect.left + rect.width / 2), y: start.startMidpoint.y - (rect.top + rect.height / 2) }
        : { x: 0, y: 0 };
      const ratio = nextZoom / start.startZoom;
      commitTransform(nextZoom, {
        x: focus.x - (focus.x - start.startPan.x) * ratio + currentMidpoint.x - start.startMidpoint.x,
        y: focus.y - (focus.y - start.startPan.y) * ratio + currentMidpoint.y - start.startMidpoint.y,
      });
      movedRef.current = true;
    } else if (points.length === 1) {
      const start = gestureRef.current;
      const dx = points[0].x - start.dragStart.x;
      const dy = points[0].y - start.dragStart.y;
      if (!movedRef.current && Math.hypot(dx, dy) > 3) {
        movedRef.current = true;
        captureActivePointers(event.currentTarget);
      }
      if (!movedRef.current) return;
      commitTransform(zoomRef.current, { x: start.startPan.x + dx, y: start.startPan.y + dy });
    }
  };

  const endPointerGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    const points = [...pointersRef.current.values()];
    if (points.length === 1) {
      gestureRef.current.dragStart = points[0];
      gestureRef.current.startPan = panRef.current;
    }
  };

  const selectedMaterialCount = analysis?.rooms.filter((room) => FLOOR_MATERIALS.some((item) => item.id === roomFloorMaterials[room.id])
    && WALL_MATERIALS.some((item) => item.id === roomWallMaterials[room.id])).length || 0;
  const vectorPixelsPerMeter = analysis ? manualPixelsPerMeter || inferPixelsPerMeter(analysis.rooms) : undefined;
  const roomPatternId = (roomId: string) => `floor-pattern-${roomId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const roomTextureGeometry = (room: FloorplanRoom, materialId: string) => {
    const module = FLOOR_TEXTURE_MODULES[materialId] || { widthM: 0.12, lengthM: 0.9, label: 'generic floor module' };
    const scale = textureScalePercent / 100;
    const pixelsPerMeter = vectorPixelsPerMeter || Math.max(imageSize.width, imageSize.height) / 10;
    const widthX = Math.max(0.35, module.widthM * scale * pixelsPerMeter / imageSize.width * 100);
    const widthY = Math.max(0.35, module.widthM * scale * pixelsPerMeter / imageSize.height * 100);
    const lengthX = Math.max(widthX, module.lengthM * scale * pixelsPerMeter / imageSize.width * 100);
    const lengthY = Math.max(widthY, module.lengthM * scale * pixelsPerMeter / imageSize.height * 100);
    const centroid = {
      x: room.polygon.reduce((sum, point) => sum + point.x, 0) / room.polygon.length,
      y: room.polygon.reduce((sum, point) => sum + point.y, 0) / room.polygon.length,
    };
    const longestEdge = room.polygon.map((point, index) => {
      const next = room.polygon[(index + 1) % room.polygon.length];
      return {
        dx: next.x - point.x,
        dy: next.y - point.y,
        length: Math.hypot((next.x - point.x) * imageSize.width, (next.y - point.y) * imageSize.height),
      };
    }).sort((a, b) => b.length - a.length)[0];
    const angle = longestEdge ? Math.atan2(longestEdge.dy, longestEdge.dx) * 180 / Math.PI : 0;
    return { widthX, widthY, lengthX, lengthY, centroid, angle };
  };

  const vectorFloorPattern = (room: FloorplanRoom, materialId: string, swatch: string) => {
    const geometry = roomTextureGeometry(room, materialId);
    const transform = `rotate(${geometry.angle} ${geometry.centroid.x} ${geometry.centroid.y})`;
    const originX = geometry.centroid.x - geometry.lengthX / 2;
    const originY = geometry.centroid.y - geometry.lengthY / 2;
    const lineColor = 'rgba(42,35,28,.34)';
    const subtleLine = 'rgba(255,255,255,.22)';

    if (materialId.includes('tile')) return <pattern key={room.id} id={roomPatternId(room.id)} patternUnits="userSpaceOnUse" x={geometry.centroid.x - geometry.widthX / 2} y={geometry.centroid.y - geometry.widthY / 2} width={geometry.widthX} height={geometry.widthY} patternTransform={transform}>
      <rect width={geometry.widthX} height={geometry.widthY} fill={swatch} fillOpacity=".68" />
      <path d={`M 0 0 H ${geometry.widthX} V ${geometry.widthY}`} fill="none" stroke={lineColor} strokeWidth=".09" />
      <path d={`M .08 .08 H ${Math.max(.08, geometry.widthX - .08)}`} fill="none" stroke={subtleLine} strokeWidth=".05" />
    </pattern>;

    if (materialId.includes('carpet')) return <pattern key={room.id} id={roomPatternId(room.id)} patternUnits="userSpaceOnUse" x={originX} y={originY} width={geometry.widthX} height={geometry.widthY} patternTransform={transform}>
      <rect width={geometry.widthX} height={geometry.widthY} fill={swatch} fillOpacity=".7" />
      <path d={`M 0 0 H ${geometry.widthX} V ${geometry.widthY} M 0 ${geometry.widthY * .33} H ${geometry.widthX} M 0 ${geometry.widthY * .66} H ${geometry.widthX}`} fill="none" stroke={lineColor} strokeOpacity=".45" strokeWidth=".06" />
    </pattern>;

    if (materialId.includes('herringbone')) return <pattern key={room.id} id={roomPatternId(room.id)} patternUnits="userSpaceOnUse" x={originX} y={originY} width={geometry.lengthX * 2} height={geometry.lengthY} patternTransform={transform}>
      <rect width={geometry.lengthX * 2} height={geometry.lengthY} fill={swatch} fillOpacity=".68" />
      <path d={`M 0 ${geometry.lengthY} L ${geometry.lengthX} 0 M ${geometry.lengthX * .5} ${geometry.lengthY} L ${geometry.lengthX * 1.5} 0 M ${geometry.lengthX} ${geometry.lengthY} L ${geometry.lengthX * 2} 0 M 0 0 L ${geometry.lengthX} ${geometry.lengthY} M ${geometry.lengthX} 0 L ${geometry.lengthX * 2} ${geometry.lengthY}`} fill="none" stroke={lineColor} strokeWidth=".09" />
    </pattern>;

    return <pattern key={room.id} id={roomPatternId(room.id)} patternUnits="userSpaceOnUse" x={originX} y={originY} width={geometry.lengthX} height={geometry.widthY * 2} patternTransform={transform}>
      <rect width={geometry.lengthX} height={geometry.widthY * 2} fill={swatch} fillOpacity=".68" />
      <path d={`M 0 ${geometry.widthY} H ${geometry.lengthX} M 0 ${geometry.widthY * 2} H ${geometry.lengthX} M 0 0 V ${geometry.widthY} M ${geometry.lengthX * .5} ${geometry.widthY} V ${geometry.widthY * 2}`} fill="none" stroke={lineColor} strokeWidth=".09" />
      <path d={`M 0 ${geometry.widthY * .18} H ${geometry.lengthX}`} fill="none" stroke={subtleLine} strokeWidth=".05" />
    </pattern>;
  };

  return <section className="floorplan-workspace" aria-label={t('カラー平面図の作成', 'Color floorplan creation')}>
    <div className="floorplan-main-panel">
      <header className="floorplan-header">
        <div><span>VECTOR COLOR + AI PRESENTATION</span><h2>{t('図面構造を保ち、平面図全体を自動カラー化', 'Automatically colorize the complete plan without changing its structure')}</h2><p>{t('部屋検出後、床・壁の仕上げと方向・タイルグリッドを自動設定し、正確なベクターカラー図を作成。最終レンダーでは家具・建具・設備まで同じスタイルで着彩します。', 'After room detection, floor and wall finishes, plank direction, and tile grids are assigned automatically in an accurate vector plan. The final render colours furniture, joinery, and fixtures in the same style.')}</p></div>
        <button className="change-photo" disabled={loading || renderingFloorplan} onClick={() => inputRef.current?.click()}>{imageUrl ? t('平面図を変更', 'Change floorplan') : t('平面図を選択', 'Choose floorplan')}</button>
      </header>

      <div className="floorplan-workflow-steps" aria-label={t('カラー平面図ワークフロー', 'Color floorplan workflow')}>
        <div className={analysis ? 'complete' : 'active'}><b>1</b><span><strong>{t('部屋を検出', 'Detect rooms')}</strong><small>{analysis ? t(`${analysis.rooms.length}室を検出`, `${analysis.rooms.length} rooms found`) : t('図面をアップロード', 'Upload the plan')}</small></span></div>
        <div className={analysis && selectedMaterialCount === analysis.rooms.length ? 'complete' : analysis ? 'active' : ''}><b>2</b><span><strong>{t('自動カラー化', 'Auto colorize')}</strong><small>{analysis ? `${selectedMaterialCount}/${analysis.rooms.length}` : '—'}</small></span></div>
        <div className={renderedFloorplan && !floorplanRenderStale ? 'complete' : analysis ? 'active' : ''}><b>3</b><span><strong>{t('図面全体を再構築', 'Recreate full plan')}</strong><small>{renderedFloorplan ? floorplanRenderStale ? t('更新が必要', 'Update needed') : t('生成済み', 'Ready') : t('スタイルを選択', 'Choose a style')}</small></span></div>
      </div>

      <input ref={inputRef} type="file" accept="image/png,image/jpeg" hidden onChange={(event) => loadFloorplan(event.target.files?.[0])} />
      <div className={`floorplan-stage ${dragActive ? 'dragging' : ''} ${!imageUrl ? 'empty' : ''}`}
        onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }} onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragActive(false)} onDrop={(event) => { event.preventDefault(); setDragActive(false); loadFloorplan(event.dataTransfer.files[0]); }}
        onClick={() => { if (!imageUrl) inputRef.current?.click(); }} role={!imageUrl ? 'button' : undefined} tabIndex={!imageUrl ? 0 : undefined}
        onKeyDown={(event) => { if (!imageUrl && event.key === 'Enter') inputRef.current?.click(); }}>
        {loading || renderingFloorplan ? <div className="floorplan-loading"><span className="studio-spinner" /><strong>{renderingFloorplan ? t('図面全体を再構築しています', 'Reconstructing the complete floorplan') : t('壁・開口・部屋を解析しています', 'Detecting walls, openings, and rooms')}</strong><small>{renderingFloorplan ? t('壁・開口・建具・設備を固定し、選択スタイルを適用中…', 'Locking walls, openings, doors, and fixtures before applying the style…') : t('ドア幅から縮尺と面積を推定中…', 'Calibrating scale and areas from door width…')}</small></div>
          : activeImageUrl ? <><div ref={viewportRef} className={`floorplan-viewport ${zoom > 1 ? 'zoomed' : ''}`}
            onPointerDown={startPointerGesture} onPointerMove={movePointerGesture} onPointerUp={endPointerGesture} onPointerCancel={endPointerGesture}
            onPointerLeave={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) endPointerGesture(event); }}
            onDoubleClick={resetView} onClickCapture={(event) => { if (movedRef.current) { event.preventDefault(); event.stopPropagation(); movedRef.current = false; } }}>
            <div ref={canvasRef} className="floorplan-canvas" style={{ width: fittedSize.width, height: fittedSize.height }}><img src={activeImageUrl} alt={floorplanView === 'render' ? t('生成したカラー平面図', 'Rendered color floorplan') : t('アップロードした平面図', 'Uploaded floorplan')} draggable={false} onLoad={(event) => floorplanView === 'render' ? setRenderImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }) : setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} />
            {analysis && floorplanView === 'plan' && <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={t('検出された部屋と仕上げ', 'Detected rooms and finishes')}>
              <defs>{analysis.rooms.map((room) => {
                const material = FLOOR_MATERIALS.find((item) => item.id === roomFloorMaterials[room.id]);
                return material ? vectorFloorPattern(room, material.id, material.swatch) : null;
              })}</defs>
              {analysis.rooms.map((room, index) => {
                const material = FLOOR_MATERIALS.find((item) => item.id === roomFloorMaterials[room.id]);
                return <g key={room.id} className={`selected ${material ? 'material-preview vector-colorized' : ''}`}>
                <title>{`${language === 'ja' ? room.nameJa : room.nameEn} · ${material ? language === 'ja' ? material.colorJa : material.colorEn : t('床材未選択', 'No floor selected')}`}</title>
                <polygon points={room.polygon.map((point) => `${point.x},${point.y}`).join(' ')} style={{ '--room-color': material?.swatch || ROOM_COLORS[index % ROOM_COLORS.length], fill: material ? `url(#${roomPatternId(room.id)})` : undefined } as React.CSSProperties} />
                {room.polygon[0] && <text x={room.polygon.reduce((sum, point) => sum + point.x, 0) / room.polygon.length} y={room.polygon.reduce((sum, point) => sum + point.y, 0) / room.polygon.length}>{index + 1}</text>}
                {editingRoomId === room.id && room.polygon.map((point, pointIndex) => <circle key={pointIndex} className="polygon-handle" cx={point.x} cy={point.y} r={1.15 / zoom}
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); handleRectRef.current = svgRectOf(event.currentTarget); }}
                  onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) queuePolygonPoint(room.id, pointIndex, { x: event.clientX, y: event.clientY }); }}
                  onPointerUp={(event) => { event.stopPropagation(); event.currentTarget.releasePointerCapture(event.pointerId); }} />)}
              </g>;})}
              {geometryTool && <g className="geometry-tool-layer">
                {geometryTool === 'split-room' && splitRoomId && <polygon className="split-room-target" points={analysis.rooms.find((room) => room.id === splitRoomId)?.polygon.map((point) => `${point.x},${point.y}`).join(' ')} />}
                {geometryTool === 'draw-room' && drawPoints.length > 1 && <polygon className="draft-room-polygon" points={drawPoints.map((point) => `${point.x},${point.y}`).join(' ')} />}
                {geometryTool === 'split-room' && splitPoints.length === 2 && <line className="draft-split-line" x1={splitPoints[0].x} y1={splitPoints[0].y} x2={splitPoints[1].x} y2={splitPoints[1].y} />}
                <rect x="0" y="0" width="100" height="100" onPointerDown={(event) => event.stopPropagation()} onClick={handleGeometryPoint} />
                {(geometryTool === 'draw-room' ? drawPoints : splitPoints).map((point, index) => <g className="geometry-point" key={index}><circle cx={point.x} cy={point.y} r={1.35 / zoom} /><text x={point.x} y={point.y}>{index + 1}</text></g>)}
              </g>}
              {calibrationMode && <g className="calibration-layer">
                <rect x="0" y="0" width="100" height="100" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); const point = pointFromEvent(event); setCalibrationPoints((current) => current.length >= 2 ? [point] : [...current, point]); }} />
                {calibrationPoints.length === 2 && <line x1={calibrationPoints[0].x} y1={calibrationPoints[0].y} x2={calibrationPoints[1].x} y2={calibrationPoints[1].y} />}
                {calibrationPoints.map((point, index) => <g key={index}><circle cx={point.x} cy={point.y} r={1.35 / zoom} /><text x={point.x} y={point.y}>{index + 1}</text></g>)}
              </g>}
            </svg>}
            </div>
          </div><div className="floorplan-zoom-controls" role="group" aria-label={t('平面図のズーム', 'Floorplan zoom')} onPointerDown={(event) => event.stopPropagation()}>
            <button aria-label={t('縮小', 'Zoom out')} disabled={zoom <= MIN_ZOOM} onClick={() => zoomAt(zoomRef.current / 1.25)}>−</button>
            <output aria-live="polite">{Math.round(zoom * 100)}%</output>
            <button aria-label={t('拡大', 'Zoom in')} disabled={zoom >= MAX_ZOOM} onClick={() => zoomAt(zoomRef.current * 1.25)}>＋</button>
            <button className="fit-button" onClick={resetView}>{t('全体表示', 'Fit')}</button>
          </div><div className="floorplan-view-switch" role="tablist" onPointerDown={(event) => event.stopPropagation()}>
            <button className={floorplanView === 'plan' ? 'active' : ''} onClick={() => showFloorplanView('plan')}>{t('ベクターカラー', 'Vector color')}</button>
            <button className={floorplanView === 'render' ? 'active' : ''} disabled={!renderedFloorplan} onClick={() => showFloorplanView('render')}>{t('完成レンダー', 'Full render')}</button>
          </div>
          {floorplanView === 'plan' && <div className="floorplan-edit-controls" onPointerDown={(event) => event.stopPropagation()}>
            <button className={calibrationMode ? 'active' : ''} disabled={!analysis} onClick={() => { const nextMode = !calibrationMode; cancelGeometryTool(); cancelRoomRename(); setCalibrationMode(nextMode); setCalibrationPoints([]); setEditingRoomId(undefined); }}>{t('縮尺を補正', 'Calibrate scale')}</button>
            <button className={geometryTool === 'draw-room' ? 'active' : ''} disabled={!analysis} onClick={() => geometryTool === 'draw-room' ? cancelGeometryTool() : beginDrawRoom()}>{t('部屋を描画', 'Draw room')}</button>
            {manualPixelsPerMeter && <span>✓ {t('手動補正済み', 'Manually calibrated')}</span>}
          </div>}
          {floorplanView === 'render' && floorplanRenderStale && <div className="floorplan-render-stale">{t('仕上げまたはスタイルが変更されました · 再生成してください', 'Finishes or style changed · render again')}</div>}
          {floorplanView === 'plan' && calibrationMode && <div className="floorplan-calibration-editor" onPointerDown={(event) => event.stopPropagation()}>
            <div><strong>{t('既知寸法の両端をクリック', 'Click both ends of a known dimension')}</strong><small>{calibrationPoints.length}/2 {t('点を選択', 'points selected')}</small></div>
            <label><span>{t('実寸', 'Actual length')}</span><input type="number" min="0.1" step="0.1" value={calibrationLengthM} onChange={(event) => setCalibrationLengthM(Number(event.target.value) || 1)} /><em>m</em></label>
            <button disabled={calibrationPoints.length !== 2} onClick={applyManualCalibration}>{t('補正を適用', 'Apply calibration')}</button>
          </div>}
          {floorplanView === 'plan' && geometryTool && <div className="floorplan-geometry-editor" onPointerDown={(event) => event.stopPropagation()}>
            <div><strong>{geometryTool === 'draw-room' ? t('部屋の角を順番にクリック', 'Click each room corner in order') : t('部屋を横切る分割線を指定', 'Place a line across the room')}</strong><small>{geometryTool === 'draw-room' ? t(`${drawPoints.length}点 · 3点以上必要`, `${drawPoints.length} points · at least 3 required`) : t(`${splitPoints.length}/2点を選択`, `${splitPoints.length}/2 points selected`)}</small>{geometryError && <em>{geometryError}</em>}</div>
            <button className="secondary" onClick={cancelGeometryTool}>{t('キャンセル', 'Cancel')}</button>
            <button disabled={geometryTool === 'draw-room' ? drawPoints.length < 3 : splitPoints.length !== 2} onClick={geometryTool === 'draw-room' ? finishDrawnRoom : finishRoomSplit}>{geometryTool === 'draw-room' ? t('部屋を追加', 'Add room') : t('分割を適用', 'Apply split')}</button>
          </div>}
          {!calibrationMode && !geometryTool && <div className="floorplan-gesture-hint">{t('スクロールで拡大 · ドラッグで移動 · 2本指でピンチ', 'Scroll to zoom · drag to pan · pinch with two fingers')}</div>}</>
          : <div className="upload-message"><span>＋</span><strong>{t('白黒の平面図をアップロード', 'Upload a black-and-white floorplan')}</strong><small>PNG / JPEG · {t('最大12MB', '12 MB max')}</small><em>{t('AIが部屋を検出した後、各室の床材・壁材と仕上がりスタイルを選べます。', 'AI will detect the rooms, then you can assign floors and walls and choose a presentation style.')}</em></div>}
      </div>

      <footer className="floorplan-controls">
        <label><span>{t('基準ドア幅', 'Standard door width')}</span><div><input type="number" min="0.6" max="1.2" step="0.05" value={doorWidth} onChange={(event) => setDoorWidth(Number(event.target.value) || 0.8)} /><em>m</em></div></label>
        <div><strong>{fileName || t('平面図未選択', 'No floorplan selected')}</strong><small>{t('一般的な室内ドアは0.8mとして設定済みです。図面に寸法があればAIが優先します。', 'Preset to a typical 0.8 m interior door. AI prioritizes written dimensions when present.')}</small></div>
        <button className="render-button" disabled={!imageData || loading || renderingFloorplan} onClick={analyzeFloorplan}>{analysis ? t('部屋を再検出', 'Detect again') : t('部屋を検出', 'Detect rooms')} <span>→</span></button>
      </footer>
      {error && <div className="render-error demo-notice"><strong>{t('今回は解析されませんでした', 'Not analyzed this time')}</strong><span>{error}</span></div>}
    </div>

    <aside className="floorplan-room-panel">
      <div className="changes-heading"><div><span>ROOM FINISH MATERIALS</span><h2>{t('部屋ごとの仕上げ', 'Finishes by room')}</h2></div><strong>{analysis ? `${selectedMaterialCount}/${analysis.rooms.length}` : '0'}</strong></div>
      {analysis ? <>
        <div className="floorplan-calibration"><span>{t('縮尺基準', 'Scale reference')}</span><strong>{manualPixelsPerMeter ? t('手動寸法', 'Manual dimension') : analysis.scaleSource === 'explicit-dimension' ? t('図面記載寸法', 'Written dimension') : analysis.scaleSource === 'door-width' ? `${analysis.assumedDoorWidthM.toFixed(2)} m ${t('ドア', 'door')}` : t('概算', 'Estimate')}</strong><small>{analysis.scaleEvidence || t(`ドア ${analysis.detectedDoorCount}箇所を検出`, `${analysis.detectedDoorCount} door(s) detected`)} · {analysis.confidence === 'high' ? t('詳細', 'Detailed') : analysis.confidence === 'medium' ? t('標準', 'Standard') : t('参考値', 'Indicative')}</small></div>
        <button className="floorplan-auto-materials" onClick={autoAssignMaterials}><span>✦</span><strong>{t('全室の床・壁を自動提案', 'Auto-assign all floors and walls')}</strong><small>{t('室名と用途から選択 · 方向とグリッドも自動整列', 'Uses room type · also aligns plank direction and tile grids')}</small></button>
        <div className="detected-room-list">
          {analysis.rooms.map((detectedRoom, index) => {
            const criticalRoomIssues = (detectedRoom.validationIssues || []).filter(isCriticalValidationIssue);
            const selectedMaterial = FLOOR_MATERIALS.find((item) => item.id === roomFloorMaterials[detectedRoom.id]);
            const selectedWall = WALL_MATERIALS.find((item) => item.id === roomWallMaterials[detectedRoom.id]);
            return <article className={`detected-room-card selected ${editingRoomId === detectedRoom.id ? 'editing' : ''} ${renamingRoomId === detectedRoom.id ? 'renaming' : ''}`} key={detectedRoom.id}>
              <div className="detected-room-title"><span className="room-index" style={{ background: ROOM_COLORS[index % ROOM_COLORS.length] }}>{index + 1}</span><span><strong>{language === 'ja' ? detectedRoom.nameJa : detectedRoom.nameEn}</strong><small>{detectedRoom.floorAreaM2.toFixed(1)} m² · {detectedRoom.roomWidthM.toFixed(1)} × {detectedRoom.roomDepthM.toFixed(1)} m</small>{Boolean(criticalRoomIssues.length) && <em className="room-validation-warning">⚠ {t('輪郭を確認してください', 'Outline needs attention')}</em>}</span></div>
              {renamingRoomId === detectedRoom.id && <form className="room-rename-editor" onSubmit={saveRoomRename} onKeyDown={(event) => { if (event.key === 'Escape') cancelRoomRename(); }}>
                <label><span>{t('部屋名', 'Room name')}</span><input autoFocus value={renameDraft} onChange={(event) => { setRenameDraft(event.target.value); setRenameError(undefined); }} /></label>
                {renameError && <em>{renameError}</em>}
                <div><button type="button" onClick={cancelRoomRename}>{t('キャンセル', 'Cancel')}</button><button type="submit">{t('名前を保存', 'Save name')}</button></div>
              </form>}
              <div className="room-material-pickers">
              <label className="room-material-picker">
                <i style={{ background: selectedMaterial?.swatch || '#e5e7eb' }} />
                <span><small>{t('床材', 'Floor material')}</small><select value={roomFloorMaterials[detectedRoom.id] || ''} onChange={(event) => selectRoomFloorMaterial(detectedRoom.id, event.target.value)}>
                  <option value="" disabled>{t('床材を選択', 'Choose a floor')}</option>
                  {FLOOR_MATERIAL_GROUPS.map((group) => <optgroup key={group.id} label={language === 'ja' ? group.labelJa : group.labelEn}>
                    {group.items.map((material) => <option key={material.id} value={material.id}>{language === 'ja' ? `${material.nameJa} · ${material.colorJa}` : `${material.nameEn} · ${material.colorEn}`}</option>)}
                  </optgroup>)}
                </select></span>
              </label>
              <label className="room-material-picker">
                <i style={{ background: selectedWall?.swatch || '#e5e7eb' }} />
                <span><small>{t('壁材', 'Wall material')}</small><select value={roomWallMaterials[detectedRoom.id] || ''} onChange={(event) => selectRoomWallMaterial(detectedRoom.id, event.target.value)}>
                  <option value="" disabled>{t('壁材を選択', 'Choose a wall')}</option>
                  {WALL_MATERIAL_GROUPS.map((group) => <optgroup key={group.id} label={language === 'ja' ? group.labelJa : group.labelEn}>
                    {group.items.map((material) => <option key={material.id} value={material.id}>{language === 'ja' ? `${material.nameJa} · ${material.colorJa}` : `${material.nameEn} · ${material.colorEn}`}</option>)}
                  </optgroup>)}
                </select></span>
              </label>
              </div>
              <div className="room-geometry-actions">
                <button className={renamingRoomId === detectedRoom.id ? 'rename-room-button active' : 'rename-room-button'} onClick={() => renamingRoomId === detectedRoom.id ? cancelRoomRename() : beginRoomRename(detectedRoom)}>{t('名前を変更', 'Rename')}</button>
                <button className="edit-outline-button" onClick={() => { cancelGeometryTool(); cancelRoomRename(); setEditingRoomId((current) => current === detectedRoom.id ? undefined : detectedRoom.id); setCalibrationMode(false); setCalibrationPoints([]); }}>{editingRoomId === detectedRoom.id ? t('編集を終了', 'Finish editing') : t('輪郭を編集', 'Edit outline')}</button>
                <button className={geometryTool === 'split-room' && splitRoomId === detectedRoom.id ? 'split-room-button active' : 'split-room-button'} onClick={() => geometryTool === 'split-room' && splitRoomId === detectedRoom.id ? cancelGeometryTool() : beginSplitRoom(detectedRoom.id)}>{t('部屋を分割', 'Subdivide room')}</button>
              </div>
              <div className="room-area-summary">
                <div><span>{t('床', 'Floor')}</span><b>{detectedRoom.floorAreaM2.toFixed(1)} m²</b></div>
                <div><span>{t('壁', 'Walls')}</span><b>{detectedRoom.netWallAreaM2.toFixed(1)} m²</b></div>
                <div><span>{t('天井', 'Ceiling')}</span><b>{detectedRoom.ceilingAreaM2.toFixed(1)} m²</b></div>
              </div>
            </article>;
          })}
        </div>
        <div className="floorplan-render-panel">
          <div className="floorplan-render-heading"><span>STEP 03</span><strong>{t('図面全体のスタイル', 'Whole-plan style')}</strong></div>
          <div className="floorplan-structure-lock"><b>STRUCTURE LOCK</b><span>{t('部屋数・隣接関係・壁・開口・建具・設備位置を元図面に固定。着彩は全要素、追加はしません。', 'Locks room count, adjacency, walls, openings, doors, and fixed elements to the source. Everything is coloured; nothing is added.')}</span></div>
          <label className="floorplan-render-style-select"><span>{t('最終レンダースタイル', 'Final render style')}</span><select value={renderStyle} onChange={(event) => chooseRenderStyle(event.target.value as FloorplanRenderStyle)}>{RENDER_STYLES.map((option) => <option value={option.id} key={option.id}>{option.number} · {language === 'ja' ? option.ja : option.en} — {language === 'ja' ? option.detailJa : option.detailEn}</option>)}</select></label>
          <div className="floorplan-texture-scale">
            <div><span>{t('テクスチャ縮尺', 'Texture scale')}</span><strong>{textureScalePercent}%</strong></div>
            <div className="floorplan-texture-slider"><small>50%</small><input aria-label={t('ドア幅に対するテクスチャ縮尺', 'Texture scale relative to door width')} type="range" min="50" max="200" step="10" value={textureScalePercent} onChange={(event) => changeTextureScale(Number(event.target.value))} /><small>200%</small><button disabled={textureScalePercent === 100} onClick={() => changeTextureScale(100)}>1:1</button></div>
            <p><b>{t('基準', 'Reference')}: 1 {t('ドア', 'door')} = {(analysis.assumedDoorWidthM || doorWidth).toFixed(2)} m</b><span>{t('100%は実寸。小さくすると柄が細かく、大きくすると柄が大きくなります。', '100% uses physical product dimensions. Lower values make the pattern finer; higher values make it larger.')}</span></p>
          </div>
          <div className="floorplan-accuracy-note advisory">{t('ベクター図は床のみ着彩します。壁・建具・設備・元図面の家具は最終レンダーで同じスタイルに着彩されます（追加はしません）。', 'The vector plan colours floors only. Walls, joinery, fixtures, and furniture already in the source are coloured in the same style by the final render — nothing is added.')}</div>
          {Boolean(criticalAnalysisIssues.length) && <div className="floorplan-accuracy-note">⚠ {t('生成前に警告のある部屋輪郭を確認してください。', 'Review flagged room outlines before rendering.')}</div>}
          {outlineNeedsCalibration && <div className="floorplan-accuracy-note advisory">{t('輪郭が変更されています。カラー範囲には反映されます。', 'Room outlines changed and will be used for material placement.')}</div>}
          {floorplanRenderError && <div className="floorplan-render-error"><strong>{t('今回は生成されませんでした', 'Not rendered this time')}</strong><span>{floorplanRenderError}</span></div>}
          <button className="floorplan-color-render-button" disabled={renderingFloorplan || !analysis.rooms.length || selectedMaterialCount !== analysis.rooms.length} onClick={renderColorFloorplan}><span>{renderedFloorplan ? floorplanRenderStale ? t('変更を反映して再構築', 'Recreate with changes') : t('もう一度再構築', 'Recreate another version') : t('図面全体を再構築', 'Recreate full floorplan')}</span><b>→</b></button>
          <small className="floorplan-credit-note">{t('クリックごとに画像生成を1回実行 · 自動再試行なし', 'One image-generation call per click · no automatic retry')}</small>
        </div>
      </> : <div className="floorplan-empty-results"><span>01</span><strong>{t('平面図を解析すると、ここに部屋が並びます', 'Detected rooms will appear here')}</strong><p>{t('部屋名と輪郭を確認し、各室に床材と壁材を選択できます。', 'Review room names and outlines, then assign a floor and wall material to every room.')}</p></div>}
    </aside>
  </section>;
}
