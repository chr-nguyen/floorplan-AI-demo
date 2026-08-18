import type { APIRoute } from 'astro';

const GOOGLE_API_KEY = import.meta.env.GOOGLE_API_KEY;
const MODEL = import.meta.env.GEMINI_VISION_MODEL || 'gemini-3.6-flash';
const PROMPT_VERSION = 'floorplan-takeoff-accuracy-v2';
const MAX_IMAGE_LENGTH = 3_400_000;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const finiteInRange = (value: unknown, min: number, max: number, precision = 1) => {
  const number = Number(value);
  const factor = 10 ** precision;
  return Number.isFinite(number) && number >= min && number <= max ? Math.round(number * factor) / factor : undefined;
};

interface Point { x: number; y: number }

const safePoint = (point: any): Point | undefined => {
  const x = finiteInRange(point?.x, 0, 100);
  const y = finiteInRange(point?.y, 0, 100);
  return x === undefined || y === undefined ? undefined : { x, y };
};

const signedArea = (polygon: Point[]) => polygon.reduce((sum, point, index) => {
  const next = polygon[(index + 1) % polygon.length];
  return sum + point.x * next.y - next.x * point.y;
}, 0) / 2;

const orientation = (a: Point, b: Point, c: Point) => Math.sign((b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y));
const segmentsCross = (a: Point, b: Point, c: Point, d: Point) => orientation(a, b, c) !== orientation(a, b, d) && orientation(c, d, a) !== orientation(c, d, b);
const selfIntersects = (polygon: Point[]) => polygon.some((point, index) => {
  const next = polygon[(index + 1) % polygon.length];
  return polygon.some((candidate, candidateIndex) => {
    const candidateNext = polygon[(candidateIndex + 1) % polygon.length];
    if (index === candidateIndex || (index + 1) % polygon.length === candidateIndex || index === (candidateIndex + 1) % polygon.length) return false;
    return segmentsCross(point, next, candidate, candidateNext);
  });
});

const validatedConfidence = (confidence: unknown, issueCount: number, scaleSource: string) => {
  const rank = confidence === 'high' ? 2 : confidence === 'medium' ? 1 : 0;
  const scaleCap = scaleSource === 'explicit-dimension' ? 2 : scaleSource === 'door-width' ? 1 : 0;
  const issueCap = issueCount === 0 ? 2 : issueCount === 1 ? 1 : 0;
  return (['low', 'medium', 'high'] as const)[Math.min(rank, scaleCap, issueCap)];
};

export const POST: APIRoute = async ({ request }) => {
  if (!GOOGLE_API_KEY) return json({ error: 'GOOGLE_API_KEY is not configured on the server.' }, 503);

  try {
    const body = await request.json();
    const floorplan = typeof body.floorplan === 'string' ? body.floorplan : '';
    const standardDoorWidthM = finiteInRange(body.standardDoorWidthM, 0.6, 1.2, 2) || 0.8;
    if (!floorplan || floorplan.length > MAX_IMAGE_LENGTH) return json({ error: 'The floorplan image is too large after downscaling. Try a smaller file.' }, 400);
    const match = floorplan.match(/^data:(image\/(?:png|jpeg));base64,(.+)$/);
    if (!match) return json({ error: 'The floorplan must be a PNG or JPEG data URL.' }, 400);

    const prompt = `Analyze this residential architectural floorplan and produce a room-by-room finish takeoff.

Scale method:
- First use any explicit written dimensions or scale bar visible in the drawing.
- Otherwise detect interior door openings and use ${standardDoorWidthM} metres as the standard clear door width scale anchor.
- Do not use furniture symbols as primary scale references.
- Report scaleSource as explicit-dimension, door-width, or unknown and briefly quote or describe the visible evidence. Never call the scale explicit-dimension unless the dimension text is legible.

For every enclosed, finishable interior room (including corridors and closets when clearly enclosed):
1. Return a stable short id, Japanese and English room names, and the closest supported roomType.
2. Return a polygon tracing the room inside face in normalized image coordinates from 0 to 100. Use 4–12 ordered points. Do not include labels or exterior space.
3. Estimate roomWidthM, roomDepthM, perimeterM, floorAreaM2, and ceilingAreaM2.
4. Estimate netWallAreaM2 using a 2.4 m ceiling height, subtracting visible doors and windows.
5. Return confidence as high, medium, or low.

Keep floor and ceiling areas internally consistent. Avoid double-counting open-plan zones; separate them only when the drawing clearly labels functional areas. State that all measurements are estimates requiring site verification. Return only the requested structured result.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    let apiResponse: Response;
    try {
      apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GOOGLE_API_KEY },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: match[1], data: match[2] } }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'object',
              properties: {
                detectedDoorCount: { type: 'number' },
                scaleSource: { type: 'string', enum: ['explicit-dimension', 'door-width', 'unknown'] },
                scaleEvidence: { type: 'string' },
                confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
                assumptionJa: { type: 'string' },
                assumptionEn: { type: 'string' },
                rooms: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' }, nameJa: { type: 'string' }, nameEn: { type: 'string' },
                      roomType: { type: 'string', enum: ['kitchen', 'living', 'dining', 'bathroom', 'bedroom', 'custom'] },
                      polygon: { type: 'array', items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] } },
                      floorAreaM2: { type: 'number' }, netWallAreaM2: { type: 'number' }, ceilingAreaM2: { type: 'number' },
                      roomWidthM: { type: 'number' }, roomDepthM: { type: 'number' }, perimeterM: { type: 'number' },
                      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
                    },
                    required: ['id', 'nameJa', 'nameEn', 'roomType', 'polygon', 'floorAreaM2', 'netWallAreaM2', 'ceilingAreaM2', 'roomWidthM', 'roomDepthM', 'perimeterM', 'confidence'],
                  },
                },
              },
              required: ['detectedDoorCount', 'scaleSource', 'scaleEvidence', 'confidence', 'assumptionJa', 'assumptionEn', 'rooms'],
            },
          },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const payload = await apiResponse.json();
    if (!apiResponse.ok) return json({ error: payload?.error?.message || `Gemini returned ${apiResponse.status}.` }, apiResponse.status);
    const responseText = payload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text).filter(Boolean).join('') || '';
    if (!responseText) return json({ error: 'Gemini did not return a floorplan analysis.' }, 502);
    const parsed = JSON.parse(responseText);

    const scaleSource = ['explicit-dimension', 'door-width', 'unknown'].includes(parsed.scaleSource) ? parsed.scaleSource : 'unknown';
    const usedIds = new Set<string>();
    const rooms = (Array.isArray(parsed.rooms) ? parsed.rooms : []).slice(0, 30).map((room: any, index: number) => {
      const polygon = (Array.isArray(room.polygon) ? room.polygon : []).slice(0, 12).map(safePoint).filter(Boolean) as Point[];
      const baseId = String(room.id || `room-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 48) || `room-${index + 1}`;
      const id = usedIds.has(baseId) ? `${baseId}-${index + 1}` : baseId;
      usedIds.add(id);
      const floorAreaM2 = finiteInRange(room.floorAreaM2, 0.5, 500);
      const netWallAreaM2 = finiteInRange(room.netWallAreaM2, 1, 1500);
      const ceilingAreaM2 = finiteInRange(room.ceilingAreaM2, 0.5, 500);
      const roomWidthM = finiteInRange(room.roomWidthM, 0.5, 50);
      const roomDepthM = finiteInRange(room.roomDepthM, 0.5, 50);
      const perimeterM = finiteInRange(room.perimeterM, 2, 200);
      const validationIssues: string[] = [];
      if (polygon.length < 3 || Math.abs(signedArea(polygon)) < 0.02) validationIssues.push('Room polygon is missing or degenerate.');
      if (polygon.length >= 4 && selfIntersects(polygon)) validationIssues.push('Room polygon self-intersects.');
      if (floorAreaM2 && ceilingAreaM2 && Math.abs(floorAreaM2 - ceilingAreaM2) / floorAreaM2 > 0.12) validationIssues.push('Floor and ceiling areas are inconsistent.');
      if (floorAreaM2 && roomWidthM && roomDepthM) {
        const rectangularArea = roomWidthM * roomDepthM;
        if (floorAreaM2 > rectangularArea * 1.15 || floorAreaM2 < rectangularArea * 0.2) validationIssues.push('Area is inconsistent with the reported room extents.');
      }
      if (netWallAreaM2 && perimeterM && netWallAreaM2 > perimeterM * 2.4 * 1.02) validationIssues.push('Net wall area exceeds gross wall area.');
      return {
        id,
        nameJa: String(room.nameJa || `室 ${index + 1}`).slice(0, 80),
        nameEn: String(room.nameEn || `Room ${index + 1}`).slice(0, 80),
        roomType: ['kitchen', 'living', 'dining', 'bathroom', 'bedroom', 'custom'].includes(room.roomType) ? room.roomType : 'custom',
        polygon,
        floorAreaM2,
        netWallAreaM2,
        ceilingAreaM2,
        roomWidthM,
        roomDepthM,
        perimeterM,
        validationIssues,
        confidence: validatedConfidence(room.confidence, validationIssues.length, scaleSource),
      };
    }).filter((room: any) => room.polygon.length >= 3 && room.floorAreaM2 && room.netWallAreaM2 && room.ceilingAreaM2 && room.roomWidthM && room.roomDepthM && room.perimeterM);

    if (!rooms.length) return json({ error: 'No complete enclosed rooms could be identified in this floorplan.' }, 422);
    return json({
      analysis: {
        rooms,
        detectedDoorCount: Math.max(0, Math.round(Number(parsed.detectedDoorCount) || 0)),
        assumedDoorWidthM: standardDoorWidthM,
        scaleSource,
        scaleEvidence: String(parsed.scaleEvidence || 'No verifiable scale evidence was returned.').slice(0, 300),
        confidence: validatedConfidence(parsed.confidence, rooms.reduce((sum: number, room: any) => sum + room.validationIssues.length, 0), scaleSource),
        validationIssues: rooms.flatMap((room: any) => room.validationIssues.map((issue: string) => `${room.nameEn}: ${issue}`)),
        measurementStatus: 'unverified-ai-estimate',
        assumptionJa: String(parsed.assumptionJa || `ドア幅${standardDoorWidthM}mを基準にした概算です。現場採寸で確認してください。`).slice(0, 400),
        assumptionEn: String(parsed.assumptionEn || `Estimated using a ${standardDoorWidthM} m door-width reference. Verify with site measurements.`).slice(0, 400),
      },
      model: MODEL,
      promptVersion: PROMPT_VERSION,
      measurementType: 'ai-floorplan-door-scale-estimate',
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return json({ error: 'Floorplan analysis timed out after 60 seconds.' }, 504);
    return json({ error: error instanceof Error ? error.message : 'Unexpected floorplan-analysis error.' }, 500);
  }
};
