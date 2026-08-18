import React, { useEffect, useRef, useState } from 'react';
import { pick, type Language } from '../i18n';
import { prepareImage, readJsonResponse, MAX_SINGLE_IMAGE_LENGTH } from './downscaleImage';
import { clearStoredFloorplan, readStoredFloorplan, writeStoredFloorplan } from './floorplanImageStore';

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

interface Point { x: number; y: number }

const ROOM_NUMERIC_FIELDS = ['floorAreaM2', 'netWallAreaM2', 'ceilingAreaM2', 'roomWidthM', 'roomDepthM', 'perimeterM'] as const;

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
  const inputRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const panRef = useRef<Point>({ x: 0, y: 0 });
  const zoomFrameRef = useRef<number>();
  const pointFrameRef = useRef<number>();
  const pendingPointRef = useRef<{ roomId: string; pointIndex: number; point: Point }>();
  const imageEffectReadyRef = useRef(false);
  const uploadStartedRef = useRef(false);
  const persistedImageRef = useRef<string>();
  const objectUrlRef = useRef<string>();
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef({ startDistance: 0, startZoom: 1, startMidpoint: { x: 0, y: 0 }, startPan: { x: 0, y: 0 }, dragStart: { x: 0, y: 0 } });
  const movedRef = useRef(false);
  const floorplanHydratedRef = useRef(false);
  const t = (ja: string, en: string) => pick(language, ja, en);
  const linkedRoomCount = Object.keys(linkedRoomIds).length;
  const isWorkflowBasis = linkedRoomCount > 0;
  const hasFloorFinishes = Object.keys(floorFinishes).length > 0;

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
  }, [imageUrl]);

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
  }, [imageUrl, viewportSize.width, viewportSize.height, imageSize.width, imageSize.height]);

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
  }, [imageUrl, viewportSize.width, viewportSize.height, fittedSize.width, fittedSize.height]);

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
      setImageSize({ width: 1, height: 1 });
      zoomRef.current = 1;
      panRef.current = { x: 0, y: 0 };
      applyTransform();
      setZoom(1);
      setError(undefined);
    }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : t('平面図を読み込めませんでした。', 'The floorplan could not be loaded.')));
  };

  const analyzeFloorplan = async () => {
    if (!imageData) return;
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
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : t('平面図の解析に失敗しました。', 'Floorplan analysis failed.'));
    } finally {
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

  const applyRooms = () => {
    if (!analysis || !takeoffReviewed || outlineNeedsCalibration) return;
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

  const pointFromEvent = (event: React.PointerEvent<SVGElement> | React.MouseEvent<SVGElement>): Point => {
    const svg = event.currentTarget.ownerSVGElement || event.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100)),
      y: Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100)),
    };
  };

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

  const queuePolygonPoint = (roomId: string, pointIndex: number, point: Point) => {
    pendingPointRef.current = { roomId, pointIndex, point };
    if (pointFrameRef.current !== undefined) return;
    pointFrameRef.current = requestAnimationFrame(() => {
      pointFrameRef.current = undefined;
      const pending = pendingPointRef.current;
      if (pending) updatePolygonPoint(pending.roomId, pending.pointIndex, pending.point);
    });
  };

  const midpoint = (points: Point[]) => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
  const distance = (points: Point[]) => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);

  const startPointerGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!imageUrl || event.button > 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    movedRef.current = false;
    const points = [...pointersRef.current.values()];
    if (points.length === 1) {
      gestureRef.current.dragStart = points[0];
      gestureRef.current.startPan = panRef.current;
    } else if (points.length === 2) {
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
      const rect = viewportRef.current?.getBoundingClientRect();
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
      if (Math.hypot(dx, dy) > 3) movedRef.current = true;
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
                  onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); }}
                  onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) queuePolygonPoint(room.id, pointIndex, pointFromEvent(event)); }}
                  onPointerUp={(event) => { event.stopPropagation(); event.currentTarget.releasePointerCapture(event.pointerId); }} />)}
              </g>;})}
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
            <button className={calibrationMode ? 'active' : ''} disabled={!analysis} onClick={() => { setCalibrationMode((current) => !current); setCalibrationPoints([]); setEditingRoomId(undefined); }}>{t('縮尺を補正', 'Calibrate scale')}</button>
            <button className={showFloorFinishPreview ? 'active preview-active' : ''} disabled={!analysis || !hasFloorFinishes} onClick={() => setShowFloorFinishPreview((current) => !current)}>{showFloorFinishPreview ? t('床プレビュー ON', 'Floor preview ON') : t('床色をプレビュー', 'Preview floor colors')}</button>
            {analysis && !hasFloorFinishes && <span className="floor-preview-hint">{isWorkflowBasis
              ? t('部屋タブで床仕上げを有効にすると色をプレビューできます', 'Enable a floor finish in a room to preview its colour here')
              : t('この平面図を適用すると床色をプレビューできます', 'Apply this takeoff to preview floor colours here')}</span>}
            {manualPixelsPerMeter && <span>✓ {t('手動補正済み', 'Manually calibrated')}</span>}
          </div>
          {calibrationMode && <div className="floorplan-calibration-editor" onPointerDown={(event) => event.stopPropagation()}>
            <div><strong>{t('既知寸法の両端をクリック', 'Click both ends of a known dimension')}</strong><small>{calibrationPoints.length}/2 {t('点を選択', 'points selected')}</small></div>
            <label><span>{t('実寸', 'Actual length')}</span><input type="number" min="0.1" step="0.1" value={calibrationLengthM} onChange={(event) => setCalibrationLengthM(Number(event.target.value) || 1)} /><em>m</em></label>
            <button disabled={calibrationPoints.length !== 2} onClick={applyManualCalibration}>{t('補正を適用', 'Apply calibration')}</button>
          </div>}
          {!calibrationMode && <div className="floorplan-gesture-hint">{isWorkflowBasis ? t('部屋をクリックして仕上げ編集へ · スクロールで拡大', 'Click a room to edit finishes · scroll to zoom') : t('スクロールで拡大 · ドラッグで移動 · 2本指でピンチ', 'Scroll to zoom · drag to pan · pinch with two fingers')}</div>}
          {showFloorFinishPreview && hasFloorFinishes && <div className="floorplan-finish-legend">{Object.entries(floorFinishes).map(([roomId, finish]) => <div key={roomId}><i style={{ background: finish.swatch }} /><span><strong>{finish.roomName}</strong><small>{finish.label}</small></span></div>)}</div>}</>
          : <div className="upload-message"><span>＋</span><strong>{t('平面図をアップロード', 'Upload a floorplan')}</strong><small>PNG / JPEG · {t('最大12MB', '12 MB max')}</small><em>{t('この手順は任意です。部屋タブから直接始めることもできます。', 'This step is optional. You can start directly from any room tab.')}</em></div>}
      </div>

      <footer className="floorplan-controls">
        <label><span>{t('基準ドア幅', 'Standard door width')}</span><div><input type="number" min="0.6" max="1.2" step="0.05" value={doorWidth} onChange={(event) => setDoorWidth(Number(event.target.value) || 0.8)} /><em>m</em></div></label>
        <div><strong>{fileName || t('平面図未選択', 'No floorplan selected')}</strong><small>{t('一般的な室内ドアは0.8mとして設定済みです。図面に寸法があればAIが優先します。', 'Preset to a typical 0.8 m interior door. AI prioritizes written dimensions when present.')}</small></div>
        <button className="render-button" disabled={!imageData || loading} onClick={analyzeFloorplan}>{analysis ? t('再解析', 'Analyze again') : t('部屋を抽出', 'Detect rooms')} <span>→</span></button>
      </footer>
      {error && <div className="render-error"><strong>{t('解析できませんでした', 'Could not analyze')}</strong><span>{error}</span></div>}
    </div>

    <aside className="floorplan-room-panel">
      <div className="changes-heading"><div><span>DETECTED ROOMS</span><h2>{t('仕上げ対象', 'Finish scope')}</h2></div><strong>{selectedRooms.length}</strong></div>
      {analysis ? <>
        <div className="floorplan-calibration"><span>{t('縮尺基準', 'Scale reference')}</span><strong>{manualPixelsPerMeter ? t('手動寸法', 'Manual dimension') : analysis.scaleSource === 'explicit-dimension' ? t('図面記載寸法', 'Written dimension') : analysis.scaleSource === 'door-width' ? `${analysis.assumedDoorWidthM.toFixed(2)} m ${t('ドア', 'door')}` : t('未確認', 'Unverified')}</strong><small>{analysis.scaleEvidence || t(`ドア ${analysis.detectedDoorCount}箇所を検出`, `${analysis.detectedDoorCount} door(s) detected`)} · {t('信頼度', 'Confidence')} {analysis.confidence}</small></div>
        <div className="detected-room-list">
          {analysis.rooms.map((detectedRoom, index) => {
            const selected = selectedRooms.includes(detectedRoom.id);
            const surfaces = roomSurfaces[detectedRoom.id] || DEFAULT_SURFACES;
            return <article className={`detected-room-card ${selected ? 'selected' : ''} ${editingRoomId === detectedRoom.id ? 'editing' : ''}`} key={detectedRoom.id}>
              <label className="detected-room-title"><input type="checkbox" checked={selected} disabled={isWorkflowBasis} onChange={() => toggleRoom(detectedRoom.id)} /><span className="room-index" style={{ background: showFloorFinishPreview && floorFinishes[detectedRoom.id] ? floorFinishes[detectedRoom.id].swatch : ROOM_COLORS[index % ROOM_COLORS.length] }}>{index + 1}</span><span><strong>{language === 'ja' ? detectedRoom.nameJa : detectedRoom.nameEn}</strong><small>{detectedRoom.floorAreaM2.toFixed(1)} m² · {detectedRoom.roomWidthM.toFixed(1)} × {detectedRoom.roomDepthM.toFixed(1)} m</small>{Boolean(detectedRoom.validationIssues?.length) && <em className="room-validation-warning">⚠ {t(`${detectedRoom.validationIssues?.length}件の整合性警告`, `${detectedRoom.validationIssues?.length} validation warning(s)`)}</em>}</span></label>
              {isWorkflowBasis && linkedRoomIds[detectedRoom.id] && <button className="open-linked-room-button" onClick={() => onOpenRoom?.(linkedRoomIds[detectedRoom.id])}>{t('この部屋の仕上げを編集', 'Edit this room’s finishes')} →</button>}
              <button className="edit-outline-button" onClick={() => { setEditingRoomId((current) => current === detectedRoom.id ? undefined : detectedRoom.id); setCalibrationMode(false); setCalibrationPoints([]); }}>{editingRoomId === detectedRoom.id ? t('編集を終了', 'Finish editing') : t('輪郭を編集', 'Edit outline')}</button>
              <div className="surface-scope">
                {SURFACES.map((surface) => <label className={surfaces[surface.id] && selected ? 'active' : ''} key={surface.id}><input type="checkbox" disabled={!selected} checked={surfaces[surface.id]} onChange={() => toggleSurface(detectedRoom.id, surface.id)} /><span>{language === 'ja' ? surface.ja : surface.en}</span><b>{surface.id === 'walls' ? detectedRoom.netWallAreaM2.toFixed(1) : surface.id === 'floor' ? detectedRoom.floorAreaM2.toFixed(1) : detectedRoom.ceilingAreaM2.toFixed(1)} m²</b></label>)}
              </div>
            </article>;
          })}
        </div>
        <div className="floorplan-apply"><p>{language === 'ja' ? analysis.assumptionJa : analysis.assumptionEn}</p>{Boolean(analysis.validationIssues?.length) && <div className="takeoff-validation-summary">⚠ {t(`${analysis.validationIssues?.length}件の整合性警告があります。該当室の輪郭と寸法を確認してください。`, `${analysis.validationIssues?.length} validation warning(s). Review the affected outlines and dimensions.`)}</div>}{outlineNeedsCalibration && <div className="takeoff-validation-summary">⚠ {t('輪郭を変更したため、既知寸法で縮尺を補正して面積を再計算してください。', 'The outline changed. Calibrate from a known dimension before recalculating and approving areas.')}</div>}<label className="takeoff-review-check"><input type="checkbox" checked={takeoffReviewed} disabled={outlineNeedsCalibration} onChange={(event) => setTakeoffReviewed(event.target.checked)} /><span>{t('部屋の輪郭・縮尺根拠・警告を確認しました', 'I reviewed room outlines, scale evidence, and warnings')}</span></label><button disabled={!selectedRooms.length || !takeoffReviewed || outlineNeedsCalibration} onClick={applyRooms}>{isWorkflowBasis ? t(`${selectedRooms.length}室を確認して再同期`, `Approve and resync ${selectedRooms.length} room(s)`) : t(`${selectedRooms.length}室を確認して仕上表を作成`, `Approve ${selectedRooms.length} room(s) and create schedule`)} <span>→</span></button></div>
      </> : <div className="floorplan-empty-results"><span>01</span><strong>{t('平面図を解析すると、ここに部屋が並びます', 'Detected rooms will appear here')}</strong><p>{t('各部屋の床・壁・天井を個別に仕上げ対象へ追加できます。', 'Add floor, walls, and ceiling to the finish scope independently for every room.')}</p></div>}
    </aside>
  </section>;
}
