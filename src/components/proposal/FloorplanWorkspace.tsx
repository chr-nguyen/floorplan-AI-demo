import React, { useEffect, useRef, useState } from 'react';
import { pick, type Language } from '../i18n';
import { prepareImage, readJsonResponse, MAX_SINGLE_IMAGE_LENGTH } from './downscaleImage';
import { clearStoredFloorplan, readStoredFloorplan, writeStoredFloorplan } from './floorplanImageStore';
import { countLineCrossings, hasSelfIntersection, polygonArea, splitPolygon, type FloorplanPoint } from './floorplanGeometry';
import { demoAiErrorMessage } from './demoAiErrors';

export type FloorplanSurface = 'floor' | 'walls' | 'ceiling';

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

export interface AppliedFloorplanRoom extends FloorplanRoom {
  surfaces: Record<FloorplanSurface, boolean>;
  assumptionJa: string;
  assumptionEn: string;
  model?: string;
  promptVersion?: string;
}

export interface FloorFinishPreview {
  swatch: string;
  label: string;
  roomName: string;
}

interface Props {
  language: Language;
  onApplyRooms: (rooms: AppliedFloorplanRoom[]) => void;
  floorFinishes?: Record<string, FloorFinishPreview>;
  linkedRoomIds?: Record<string, string>;
  onOpenRoom?: (roomId: string) => void;
}

const DEFAULT_SURFACES: Record<FloorplanSurface, boolean> = { floor: true, walls: true, ceiling: true };
const SURFACES: Array<{ id: FloorplanSurface; ja: string; en: string }> = [
  { id: 'floor', ja: '床', en: 'Floor' },
  { id: 'walls', ja: '壁', en: 'Walls' },
  { id: 'ceiling', ja: '天井', en: 'Ceiling' },
];
const ROOM_COLORS = ['#1f4cda', '#0f766e', '#b45309', '#7c3aed', '#be123c', '#0369a1', '#4d7c0f', '#9333ea'];
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const FLOORPLAN_STORAGE_KEY = 'archix-floorplan-workspace-v1';
const LEGACY_FLOORPLAN_IMAGE_KEY = 'archix-floorplan-image-v1';

type Point = FloorplanPoint;
type GeometryTool = 'draw-room' | 'split-room';

const ROOM_NUMERIC_FIELDS = ['floorAreaM2', 'netWallAreaM2', 'ceilingAreaM2', 'roomWidthM', 'roomDepthM', 'perimeterM'] as const;
const isCriticalValidationIssue = (issue: string) => /missing|degenerate|self-intersect/i.test(issue);

const sanitizeAnalysis = (value: any): FloorplanAnalysis | undefined => {
  const rooms = Array.isArray(value?.rooms) ? value.rooms : [];
  const valid = rooms.every((room: any) => room
    && typeof room.id === 'string'
    && Array.isArray(room.polygon) && room.polygon.length >= 3
    && room.polygon.every((point: any) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
    && ROOM_NUMERIC_FIELDS.every((field) => Number.isFinite(room[field])));
  if (!rooms.length || !valid) return undefined;
  return {
    ...value,
    rooms,
    detectedDoorCount: Number.isFinite(value.detectedDoorCount) ? value.detectedDoorCount : 0,
    assumedDoorWidthM: Number.isFinite(value.assumedDoorWidthM) ? value.assumedDoorWidthM : 0.8,
    confidence: ['low', 'medium', 'high'].includes(value.confidence) ? value.confidence : 'low',
    assumptionJa: typeof value.assumptionJa === 'string' ? value.assumptionJa : '',
    assumptionEn: typeof value.assumptionEn === 'string' ? value.assumptionEn : '',
  } as FloorplanAnalysis;
};

export default function FloorplanWorkspace({ language, onApplyRooms, floorFinishes = {}, linkedRoomIds = {}, onOpenRoom }: Props) {
  const [imageUrl, setImageUrl] = useState<string>();
  const [imageData, setImageData] = useState<string>();
  const [fileName, setFileName] = useState<string>();
  const [doorWidth, setDoorWidth] = useState(0.8);
  const [analysis, setAnalysis] = useState<FloorplanAnalysis>();
  const [selectedRooms, setSelectedRooms] = useState<string[]>([]);
  const [roomSurfaces, setRoomSurfaces] = useState<Record<string, Record<FloorplanSurface, boolean>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [dragActive, setDragActive] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const [zoom, setZoom] = useState(1);
  const [editingRoomId, setEditingRoomId] = useState<string>();
  const [calibrationMode, setCalibrationMode] = useState(false);
  const [calibrationPoints, setCalibrationPoints] = useState<Point[]>([]);
  const [calibrationLengthM, setCalibrationLengthM] = useState(1);
  const [manualPixelsPerMeter, setManualPixelsPerMeter] = useState<number>();
  const [showFloorFinishPreview, setShowFloorFinishPreview] = useState(false);
  const [takeoffReviewed, setTakeoffReviewed] = useState(false);
  const [outlineNeedsCalibration, setOutlineNeedsCalibration] = useState(false);
  const [geometryTool, setGeometryTool] = useState<GeometryTool>();
  const [drawPoints, setDrawPoints] = useState<Point[]>([]);
  const [splitRoomId, setSplitRoomId] = useState<string>();
  const [splitPoints, setSplitPoints] = useState<Point[]>([]);
  const [geometryError, setGeometryError] = useState<string>();
  const [renamingRoomId, setRenamingRoomId] = useState<string>();
  const [renameDraft, setRenameDraft] = useState('');
  const [renameError, setRenameError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const panRef = useRef<Point>({ x: 0, y: 0 });
  const zoomFrameRef = useRef<number>();
  const pointFrameRef = useRef<number>();
  const pendingPointRef = useRef<{ roomId: string; pointIndex: number; client: Point }>();
  const handleRectRef = useRef<DOMRect>();
  const imageEffectReadyRef = useRef(false);
  const uploadStartedRef = useRef(false);
  const persistedImageRef = useRef<string>();
  const objectUrlRef = useRef<string>();
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef({ startDistance: 0, startZoom: 1, startMidpoint: { x: 0, y: 0 }, startPan: { x: 0, y: 0 }, dragStart: { x: 0, y: 0 }, viewportRect: undefined as DOMRect | undefined });
  const movedRef = useRef(false);
  const floorplanHydratedRef = useRef(false);
  const analysisInFlightRef = useRef(false);
  const t = (ja: string, en: string) => pick(language, ja, en);
  const linkedRoomCount = Object.keys(linkedRoomIds).length;
  const isWorkflowBasis = linkedRoomCount > 0;
  const hasFloorFinishes = Object.keys(floorFinishes).length > 0;
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

  const fitScale = Math.min(viewportSize.width / imageSize.width, viewportSize.height / imageSize.height);
  const fittedSize = {
    width: Math.max(1, imageSize.width * fitScale),
    height: Math.max(1, imageSize.height * fitScale),
  };

  useEffect(() => {
    let cancelled = false;
    void readStoredFloorplan().then((stored) => {
      if (cancelled || !stored || uploadStartedRef.current) return;
      persistedImageRef.current = stored;
      setImageData(stored);
      setImageUrl(stored);
    });
    try {
      localStorage.removeItem(LEGACY_FLOORPLAN_IMAGE_KEY);
      const saved = localStorage.getItem(FLOORPLAN_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.fileName === 'string') setFileName(parsed.fileName);
        if (typeof parsed.doorWidth === 'number') setDoorWidth(parsed.doorWidth);
        const restoredAnalysis = sanitizeAnalysis(parsed.analysis);
        if (restoredAnalysis) {
          setAnalysis(restoredAnalysis);
          const roomIds = new Set(restoredAnalysis.rooms.map((room) => room.id));
          setSelectedRooms((Array.isArray(parsed.selectedRooms) ? parsed.selectedRooms : []).filter((id: unknown) => typeof id === 'string' && roomIds.has(id)));
          setRoomSurfaces(Object.fromEntries(restoredAnalysis.rooms.map((room) => [room.id, {
            ...DEFAULT_SURFACES,
            ...(parsed.roomSurfaces?.[room.id] && typeof parsed.roomSurfaces[room.id] === 'object' ? parsed.roomSurfaces[room.id] : {}),
          }])));
          if (typeof parsed.manualPixelsPerMeter === 'number') setManualPixelsPerMeter(parsed.manualPixelsPerMeter);
          if (typeof parsed.showFloorFinishPreview === 'boolean') setShowFloorFinishPreview(parsed.showFloorFinishPreview);
          if (typeof parsed.takeoffReviewed === 'boolean') setTakeoffReviewed(parsed.takeoffReviewed);
          if (typeof parsed.outlineNeedsCalibration === 'boolean') setOutlineNeedsCalibration(parsed.outlineNeedsCalibration);
        }
      }
    } catch {
      // A corrupt local draft should never block a fresh floorplan workflow.
    } finally {
      floorplanHydratedRef.current = true;
    }
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!floorplanHydratedRef.current) return;
    const timeout = window.setTimeout(() => {
      try {
        localStorage.setItem(FLOORPLAN_STORAGE_KEY, JSON.stringify({ fileName, doorWidth, analysis, selectedRooms, roomSurfaces, manualPixelsPerMeter, showFloorFinishPreview, takeoffReviewed, outlineNeedsCalibration }));
      } catch {
        // Storage can be unavailable or full; the active in-memory project remains usable.
      }
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [fileName, doorWidth, analysis, selectedRooms, roomSurfaces, manualPixelsPerMeter, showFloorFinishPreview, takeoffReviewed, outlineNeedsCalibration]);

  useEffect(() => {
    if (!imageEffectReadyRef.current) {
      imageEffectReadyRef.current = true;
      return;
    }
    if (persistedImageRef.current === imageData) return;
    persistedImageRef.current = imageData;
    if (!imageData) {
      void clearStoredFloorplan();
      return;
    }
    void writeStoredFloorplan(imageData);
  }, [imageData]);

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
  }, [imageUrl, loading]);

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
    if (!imageUrl) return;
    commitTransform(zoomRef.current, panRef.current);
  // Re-clamp after the viewport or fitted image dimensions change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, loading, viewportSize.width, viewportSize.height, imageSize.width, imageSize.height]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !imageUrl) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAt(zoomRef.current * Math.exp(-event.deltaY * 0.0015), { x: event.clientX, y: event.clientY });
    };
    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, loading, viewportSize.width, viewportSize.height, fittedSize.width, fittedSize.height]);

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
    uploadStartedRef.current = true;
    void prepareImage(file, { maxEdge: 3000, jpegQuality: 0.95, preservePng: true, maxLength: MAX_SINGLE_IMAGE_LENGTH }).then((data) => {
      const nextUrl = URL.createObjectURL(file);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = nextUrl;
      setImageUrl(nextUrl);
      setImageData(data);
      setFileName(file.name);
      setAnalysis(undefined);
      setSelectedRooms([]);
      setRoomSurfaces({});
      setEditingRoomId(undefined);
      setCalibrationMode(false);
      setCalibrationPoints([]);
      setManualPixelsPerMeter(undefined);
      setShowFloorFinishPreview(false);
      setTakeoffReviewed(false);
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
      setSelectedRooms(nextAnalysis.rooms.map((room) => room.id));
      setRoomSurfaces(Object.fromEntries(nextAnalysis.rooms.map((room) => [room.id, { ...DEFAULT_SURFACES }])));
      setEditingRoomId(undefined);
      setCalibrationMode(false);
      setCalibrationPoints([]);
      setManualPixelsPerMeter(undefined);
      setTakeoffReviewed(false);
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

  const toggleRoom = (roomId: string) => setSelectedRooms((current) => current.includes(roomId)
    ? current.filter((id) => id !== roomId)
    : [...current, roomId]);

  const toggleSurface = (roomId: string, surface: FloorplanSurface) => setRoomSurfaces((current) => ({
    ...current,
    [roomId]: { ...(current[roomId] || DEFAULT_SURFACES), [surface]: !(current[roomId] || DEFAULT_SURFACES)[surface] },
  }));

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
    setTakeoffReviewed(false);
    cancelRoomRename();
  };

  const applyRooms = () => {
    if (!analysis || !takeoffReviewed) return;
    onApplyRooms(analysis.rooms
      .filter((room) => selectedRooms.includes(room.id))
      .map((room) => ({
        ...room,
        surfaces: roomSurfaces[room.id] || { ...DEFAULT_SURFACES },
        assumptionJa: analysis.assumptionJa,
        assumptionEn: analysis.assumptionEn,
        model: analysis.model,
        promptVersion: analysis.promptVersion,
      })));
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
    setTakeoffReviewed(false);
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
    setTakeoffReviewed(false);
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
    setSelectedRooms((current) => [...new Set([...current, nextId])]);
    setRoomSurfaces((current) => ({ ...current, [nextId]: { ...DEFAULT_SURFACES } }));
    setTakeoffReviewed(false);
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
    if (selectedRooms.includes(sourceRoom.id)) setSelectedRooms((current) => [...new Set([...current, nextId])]);
    setRoomSurfaces((current) => ({ ...current, [nextId]: { ...(current[sourceRoom.id] || DEFAULT_SURFACES) } }));
    setTakeoffReviewed(false);
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
    setManualPixelsPerMeter(pixelsPerMeter);
    setTakeoffReviewed(false);
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
    setTakeoffReviewed(false);
    if (!manualPixelsPerMeter) setOutlineNeedsCalibration(true);
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
    if (!imageUrl || event.button > 0) return;
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

  return <section className="floorplan-workspace" aria-label={t('平面図の解析', 'Floorplan analysis')}>
    <div className="floorplan-main-panel">
      <header className="floorplan-header">
        <div><span>{isWorkflowBasis ? 'ACTIVE · PROJECT BASIS' : 'OPTIONAL · FLOORPLAN TAKEOFF'}</span><h2>{isWorkflowBasis ? t('プロジェクト基準平面図', 'Project basis floorplan') : t('平面図から部屋と面積を抽出', 'Extract rooms and areas from a floorplan')}</h2><p>{isWorkflowBasis ? t('この平面図の部屋・輪郭・面積が、部屋タブ、仕上表、数量集計の基準です。', 'Rooms, outlines, and areas from this plan now drive the room tabs, finish schedule, and quantity summary.') : t('一般的なドア幅を縮尺の基準にして、部屋ごとの床・壁・天井面積を概算します。', 'Uses a standard door width as the scale reference to estimate floor, wall, and ceiling areas by room.')}</p>{isWorkflowBasis && <div className="floorplan-basis-badge">✓ {t(`${linkedRoomCount}室をプロジェクトへ連携中`, `${linkedRoomCount} room(s) linked to the project`)}</div>}</div>
        <button className="change-photo" disabled={loading} onClick={() => inputRef.current?.click()}>{imageUrl ? t('平面図を変更', 'Change floorplan') : t('平面図を選択', 'Choose floorplan')}</button>
      </header>

      <input ref={inputRef} type="file" accept="image/png,image/jpeg" hidden onChange={(event) => loadFloorplan(event.target.files?.[0])} />
      <div className={`floorplan-stage ${dragActive ? 'dragging' : ''} ${!imageUrl ? 'empty' : ''}`}
        onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }} onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragActive(false)} onDrop={(event) => { event.preventDefault(); setDragActive(false); loadFloorplan(event.dataTransfer.files[0]); }}
        onClick={() => { if (!imageUrl) inputRef.current?.click(); }} role={!imageUrl ? 'button' : undefined} tabIndex={!imageUrl ? 0 : undefined}
        onKeyDown={(event) => { if (!imageUrl && event.key === 'Enter') inputRef.current?.click(); }}>
        {loading ? <div className="floorplan-loading"><span className="studio-spinner" /><strong>{t('壁・開口・部屋を解析しています', 'Detecting walls, openings, and rooms')}</strong><small>{t('ドア幅から縮尺と面積を推定中…', 'Calibrating scale and areas from door width…')}</small></div>
          : imageUrl ? <><div ref={viewportRef} className={`floorplan-viewport ${zoom > 1 ? 'zoomed' : ''}`}
            onPointerDown={startPointerGesture} onPointerMove={movePointerGesture} onPointerUp={endPointerGesture} onPointerCancel={endPointerGesture}
            onPointerLeave={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) endPointerGesture(event); }}
            onDoubleClick={resetView} onClickCapture={(event) => { if (movedRef.current) { event.preventDefault(); event.stopPropagation(); movedRef.current = false; } }}>
            <div ref={canvasRef} className="floorplan-canvas" style={{ width: fittedSize.width, height: fittedSize.height }}><img src={imageUrl} alt={t('アップロードした平面図', 'Uploaded floorplan')} draggable={false} onLoad={(event) => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} />
            {analysis && <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={t('検出された部屋', 'Detected rooms')}>
              {analysis.rooms.map((room, index) => {
                const finishPreview = floorFinishes[room.id];
                const linkedRoomId = linkedRoomIds[room.id];
                const previewingFinish = showFloorFinishPreview && Boolean(finishPreview);
                return <g key={room.id} className={`${selectedRooms.includes(room.id) ? 'selected' : 'excluded'} ${previewingFinish ? 'finish-preview' : ''} ${linkedRoomId ? 'linked-room' : ''}`} onClick={(event) => { event.stopPropagation(); if (linkedRoomId && onOpenRoom && !editingRoomId) onOpenRoom(linkedRoomId); else if (!isWorkflowBasis) toggleRoom(room.id); }}>
                <polygon points={room.polygon.map((point) => `${point.x},${point.y}`).join(' ')} style={{ '--room-color': previewingFinish ? finishPreview.swatch : ROOM_COLORS[index % ROOM_COLORS.length] } as React.CSSProperties} />
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
          </div><div className="floorplan-edit-controls" onPointerDown={(event) => event.stopPropagation()}>
            <button className={calibrationMode ? 'active' : ''} disabled={!analysis} onClick={() => { const nextMode = !calibrationMode; cancelGeometryTool(); cancelRoomRename(); setCalibrationMode(nextMode); setCalibrationPoints([]); setEditingRoomId(undefined); }}>{t('縮尺を補正', 'Calibrate scale')}</button>
            <button className={geometryTool === 'draw-room' ? 'active' : ''} disabled={!analysis} onClick={() => geometryTool === 'draw-room' ? cancelGeometryTool() : beginDrawRoom()}>{t('部屋を描画', 'Draw room')}</button>
            <button className={showFloorFinishPreview ? 'active preview-active' : ''} disabled={!analysis || !hasFloorFinishes} onClick={() => setShowFloorFinishPreview((current) => !current)}>{showFloorFinishPreview ? t('床プレビュー ON', 'Floor preview ON') : t('床色をプレビュー', 'Preview floor colors')}</button>
            {analysis && !hasFloorFinishes && !geometryTool && <span className="floor-preview-hint">{isWorkflowBasis
              ? t('部屋タブで床仕上げを有効にすると色をプレビューできます', 'Enable a floor finish in a room to preview its colour here')
              : t('この平面図を適用すると床色をプレビューできます', 'Apply this takeoff to preview floor colours here')}</span>}
            {manualPixelsPerMeter && <span>✓ {t('手動補正済み', 'Manually calibrated')}</span>}
          </div>
          {calibrationMode && <div className="floorplan-calibration-editor" onPointerDown={(event) => event.stopPropagation()}>
            <div><strong>{t('既知寸法の両端をクリック', 'Click both ends of a known dimension')}</strong><small>{calibrationPoints.length}/2 {t('点を選択', 'points selected')}</small></div>
            <label><span>{t('実寸', 'Actual length')}</span><input type="number" min="0.1" step="0.1" value={calibrationLengthM} onChange={(event) => setCalibrationLengthM(Number(event.target.value) || 1)} /><em>m</em></label>
            <button disabled={calibrationPoints.length !== 2} onClick={applyManualCalibration}>{t('補正を適用', 'Apply calibration')}</button>
          </div>}
          {geometryTool && <div className="floorplan-geometry-editor" onPointerDown={(event) => event.stopPropagation()}>
            <div><strong>{geometryTool === 'draw-room' ? t('部屋の角を順番にクリック', 'Click each room corner in order') : t('部屋を横切る分割線を指定', 'Place a line across the room')}</strong><small>{geometryTool === 'draw-room' ? t(`${drawPoints.length}点 · 3点以上必要`, `${drawPoints.length} points · at least 3 required`) : t(`${splitPoints.length}/2点を選択`, `${splitPoints.length}/2 points selected`)}</small>{geometryError && <em>{geometryError}</em>}</div>
            <button className="secondary" onClick={cancelGeometryTool}>{t('キャンセル', 'Cancel')}</button>
            <button disabled={geometryTool === 'draw-room' ? drawPoints.length < 3 : splitPoints.length !== 2} onClick={geometryTool === 'draw-room' ? finishDrawnRoom : finishRoomSplit}>{geometryTool === 'draw-room' ? t('部屋を追加', 'Add room') : t('分割を適用', 'Apply split')}</button>
          </div>}
          {!calibrationMode && !geometryTool && <div className="floorplan-gesture-hint">{isWorkflowBasis ? t('部屋をクリックして仕上げ編集へ · スクロールで拡大', 'Click a room to edit finishes · scroll to zoom') : t('部屋をクリックして対象を切替 · スクロールで拡大 · ドラッグで移動', 'Click a room to include or exclude it · scroll to zoom · drag to pan')}</div>}
          {showFloorFinishPreview && hasFloorFinishes && <div className="floorplan-finish-legend">{Object.entries(floorFinishes).map(([roomId, finish]) => <div key={roomId}><i style={{ background: finish.swatch }} /><span><strong>{finish.roomName}</strong><small>{finish.label}</small></span></div>)}</div>}</>
          : <div className="upload-message"><span>＋</span><strong>{t('平面図をアップロード', 'Upload a floorplan')}</strong><small>PNG / JPEG · {t('最大12MB', '12 MB max')}</small><em>{t('この手順は任意です。部屋タブから直接始めることもできます。', 'This step is optional. You can start directly from any room tab.')}</em></div>}
      </div>

      <footer className="floorplan-controls">
        <label><span>{t('基準ドア幅', 'Standard door width')}</span><div><input type="number" min="0.6" max="1.2" step="0.05" value={doorWidth} onChange={(event) => setDoorWidth(Number(event.target.value) || 0.8)} /><em>m</em></div></label>
        <div><strong>{fileName || t('平面図未選択', 'No floorplan selected')}</strong><small>{t('一般的な室内ドアは0.8mとして設定済みです。図面に寸法があればAIが優先します。', 'Preset to a typical 0.8 m interior door. AI prioritizes written dimensions when present.')}</small></div>
        <button className="render-button" disabled={!imageData || loading} onClick={analyzeFloorplan}>{analysis ? t('再解析', 'Analyze again') : t('部屋を抽出', 'Detect rooms')} <span>→</span></button>
      </footer>
      {error && <div className="render-error demo-notice"><strong>{t('今回は解析されませんでした', 'Not analyzed this time')}</strong><span>{error}</span></div>}
    </div>

    <aside className="floorplan-room-panel">
      <div className="changes-heading"><div><span>DETECTED ROOMS</span><h2>{t('仕上げ対象', 'Finish scope')}</h2></div><strong>{selectedRooms.length}</strong></div>
      {analysis ? <>
        <div className="floorplan-calibration"><span>{t('縮尺基準', 'Scale reference')}</span><strong>{manualPixelsPerMeter ? t('手動寸法', 'Manual dimension') : analysis.scaleSource === 'explicit-dimension' ? t('図面記載寸法', 'Written dimension') : analysis.scaleSource === 'door-width' ? `${analysis.assumedDoorWidthM.toFixed(2)} m ${t('ドア', 'door')}` : t('概算', 'Estimate')}</strong><small>{analysis.scaleEvidence || t(`ドア ${analysis.detectedDoorCount}箇所を検出`, `${analysis.detectedDoorCount} door(s) detected`)} · {analysis.confidence === 'high' ? t('詳細', 'Detailed') : analysis.confidence === 'medium' ? t('標準', 'Standard') : t('参考値', 'Indicative')}</small></div>
        <div className="detected-room-list">
          {analysis.rooms.map((detectedRoom, index) => {
            const selected = selectedRooms.includes(detectedRoom.id);
            const surfaces = roomSurfaces[detectedRoom.id] || DEFAULT_SURFACES;
            const criticalRoomIssues = (detectedRoom.validationIssues || []).filter(isCriticalValidationIssue);
            return <article className={`detected-room-card ${selected ? 'selected' : ''} ${editingRoomId === detectedRoom.id ? 'editing' : ''} ${renamingRoomId === detectedRoom.id ? 'renaming' : ''}`} key={detectedRoom.id}>
              <label className="detected-room-title"><input type="checkbox" checked={selected} disabled={isWorkflowBasis} onChange={() => toggleRoom(detectedRoom.id)} /><span className="room-index" style={{ background: showFloorFinishPreview && floorFinishes[detectedRoom.id] ? floorFinishes[detectedRoom.id].swatch : ROOM_COLORS[index % ROOM_COLORS.length] }}>{index + 1}</span><span><strong>{language === 'ja' ? detectedRoom.nameJa : detectedRoom.nameEn}</strong><small>{detectedRoom.floorAreaM2.toFixed(1)} m² · {detectedRoom.roomWidthM.toFixed(1)} × {detectedRoom.roomDepthM.toFixed(1)} m</small>{Boolean(criticalRoomIssues.length) && <em className="room-validation-warning">⚠ {t('輪郭を確認してください', 'Outline needs attention')}</em>}</span></label>
              {renamingRoomId === detectedRoom.id && <form className="room-rename-editor" onSubmit={saveRoomRename} onKeyDown={(event) => { if (event.key === 'Escape') cancelRoomRename(); }}>
                <label><span>{t('部屋名', 'Room name')}</span><input autoFocus value={renameDraft} onChange={(event) => { setRenameDraft(event.target.value); setRenameError(undefined); }} /></label>
                {renameError && <em>{renameError}</em>}
                <div><button type="button" onClick={cancelRoomRename}>{t('キャンセル', 'Cancel')}</button><button type="submit">{t('名前を保存', 'Save name')}</button></div>
                {isWorkflowBasis && <small>{t('保存後、下の「確認して再同期」で部屋タブへ反映します。', 'After saving, use “Approve and resync” below to update the room tab.')}</small>}
              </form>}
              {isWorkflowBasis && linkedRoomIds[detectedRoom.id] && <button className="open-linked-room-button" onClick={() => onOpenRoom?.(linkedRoomIds[detectedRoom.id])}>{t('この部屋の仕上げを編集', 'Edit this room’s finishes')} →</button>}
              <div className="room-geometry-actions">
                <button className={renamingRoomId === detectedRoom.id ? 'rename-room-button active' : 'rename-room-button'} onClick={() => renamingRoomId === detectedRoom.id ? cancelRoomRename() : beginRoomRename(detectedRoom)}>{t('名前を変更', 'Rename')}</button>
                <button className="edit-outline-button" onClick={() => { cancelGeometryTool(); cancelRoomRename(); setEditingRoomId((current) => current === detectedRoom.id ? undefined : detectedRoom.id); setCalibrationMode(false); setCalibrationPoints([]); }}>{editingRoomId === detectedRoom.id ? t('編集を終了', 'Finish editing') : t('輪郭を編集', 'Edit outline')}</button>
                <button className={geometryTool === 'split-room' && splitRoomId === detectedRoom.id ? 'split-room-button active' : 'split-room-button'} onClick={() => geometryTool === 'split-room' && splitRoomId === detectedRoom.id ? cancelGeometryTool() : beginSplitRoom(detectedRoom.id)}>{t('部屋を分割', 'Subdivide room')}</button>
              </div>
              <div className="surface-scope">
                {SURFACES.map((surface) => <label className={surfaces[surface.id] && selected ? 'active' : ''} key={surface.id}><input type="checkbox" disabled={!selected} checked={surfaces[surface.id]} onChange={() => toggleSurface(detectedRoom.id, surface.id)} /><span>{language === 'ja' ? surface.ja : surface.en}</span><b>{surface.id === 'walls' ? detectedRoom.netWallAreaM2.toFixed(1) : surface.id === 'floor' ? detectedRoom.floorAreaM2.toFixed(1) : detectedRoom.ceilingAreaM2.toFixed(1)} m²</b></label>)}
              </div>
            </article>;
          })}
        </div>
        <div className="floorplan-apply"><p>{language === 'ja' ? analysis.assumptionJa : analysis.assumptionEn}</p>{Boolean(criticalAnalysisIssues.length) && <div className="takeoff-validation-summary">⚠ {t('使用前に一部の部屋輪郭を確認してください。', 'Check the highlighted room outline before use.')}</div>}{outlineNeedsCalibration && <div className="takeoff-validation-summary advisory">{t('輪郭を変更しました。面積は変更前の概算のままです。正確な面積が必要な場合は既知寸法で縮尺を補正してください。', 'The outline changed, so the areas are still the earlier estimate. Calibrate from a known dimension if you need accurate areas.')}</div>}<label className="takeoff-review-check"><input type="checkbox" checked={takeoffReviewed} onChange={(event) => setTakeoffReviewed(event.target.checked)} /><span>{t('部屋名と輪郭はデモ用途として問題ありません', 'Room names and outlines look reasonable for this demo')}</span></label><button disabled={!selectedRooms.length || !takeoffReviewed} onClick={applyRooms}>{isWorkflowBasis ? t(`${selectedRooms.length}室を確認して再同期`, `Approve and resync ${selectedRooms.length} room(s)`) : t(`${selectedRooms.length}室を確認して仕上表を作成`, `Approve ${selectedRooms.length} room(s) and create schedule`)} <span>→</span></button></div>
      </> : <div className="floorplan-empty-results"><span>01</span><strong>{t('平面図を解析すると、ここに部屋が並びます', 'Detected rooms will appear here')}</strong><p>{t('各部屋の床・壁・天井を個別に仕上げ対象へ追加できます。', 'Add floor, walls, and ceiling to the finish scope independently for every room.')}</p></div>}
    </aside>
  </section>;
}
