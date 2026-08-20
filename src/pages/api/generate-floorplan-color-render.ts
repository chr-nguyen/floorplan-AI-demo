import type { APIRoute } from 'astro';

const GOOGLE_API_KEY = import.meta.env.GOOGLE_API_KEY;
const MODEL = import.meta.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
const MAX_IMAGE_LENGTH = 3_400_000;
const PROMPT_VERSION = 'floorplan-vector-alignment-styles-v5';

type RenderStyle = 'watercolor' | 'soft-marker' | 'japanese-brochure' | '3d-render' | 'photorealistic' | 'photo-dollhouse';

interface RenderRoom {
  name?: string;
  materialName?: string;
  materialColor?: string;
  specification?: string;
  textureModule?: string;
  moduleWidthM?: number;
  moduleLengthM?: number;
  patternAngleDeg?: number;
  alignmentRule?: string;
  polygon?: Array<{ x?: number; y?: number }>;
}

const STYLE_DIRECTIONS: Record<RenderStyle, string> = {
  watercolor: 'Recreate the COMPLETE plan as a refined top-down architectural watercolor. Redraw all walls, wall cuts, openings, doors, windows, stairs, columns, built-ins, sanitary fixtures, and source-visible plan symbols. Use translucent color washes, subtle paper texture, restrained shadows, and precise ink linework. Keep the same orthographic top-down projection as the source.',
  'soft-marker': 'Recreate the COMPLETE plan as a professional hand-rendered soft-marker plan in the same orthographic top-down projection. Use restrained alcohol-marker strokes, gentle tonal variation, fine architectural ink outlines, soft gray cast shadows, and clean white wall cuts. Keep materials legible and presentation-ready without loose sketch distortion.',
  'japanese-brochure': 'Recreate the COMPLETE plan as a bright Japanese residential sales-brochure floorplan in the same orthographic top-down projection. Use crisp dark-gray architectural linework, clean white wall cuts, pale realistic floor textures, restrained pastel accents, subtle depth shadows, excellent room separation, and generous white space. Prioritize clarity, cleanliness, and immediate sales-plan legibility.',
  '3d-render': 'Reconstruct the COMPLETE plan as a clean isometric architectural cutaway. Extrude only the walls and architectural elements that exist in the source, with consistent wall heights and open ceilings. Use a true axonometric/isometric camera at a restrained elevated angle, realistic scheduled floor textures, neutral wall finishes, and soft ambient occlusion. The projection may change, but footprint, topology, room count, adjacency, wall geometry, and every opening must remain identical.',
  photorealistic: 'Reconstruct the COMPLETE plan as a polished material-focused isometric CG cutaway. Favor clear, consistent product textures, clean modeled wall surfaces, controlled studio lighting, soft ambient occlusion, and brochure-quality computer-rendered materials. It should look intentionally like a premium architectural visualization rather than a photograph.',
  'photo-dollhouse': 'Reconstruct the COMPLETE plan as a genuinely photorealistic isometric dollhouse/cutaway photographed as a real miniature architectural model. Render physically plausible wall surfaces, glazing, doors, fixed cabinetry, plumbing fixtures, and source-visible furniture symbols at their exact locations. Use ray-traced natural light, realistic contact shadows, lens-consistent depth, high-frequency material detail, and photographic exposure. Avoid the smooth plastic look of generic CG. Add nothing not explicitly present in the source.',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const safeCoordinate = (value: unknown) => Math.max(0, Math.min(100, Number(value) || 0)).toFixed(2);

export const POST: APIRoute = async ({ request }) => {
  if (!GOOGLE_API_KEY) return json({ error: 'GOOGLE_API_KEY is not configured on the server.' }, 503);

  try {
    const body = await request.json();
    const floorplan = typeof body.floorplan === 'string' ? body.floorplan : '';
    const style = String(body.style || '') as RenderStyle;
    const rooms: RenderRoom[] = Array.isArray(body.rooms) ? body.rooms.slice(0, 30) : [];
    const doorWidthM = Math.max(0.6, Math.min(1.2, Number(body.doorWidthM) || 0.8));
    const textureScalePercent = Math.max(50, Math.min(200, Number(body.textureScalePercent) || 100));
    const textureScaleMultiplier = textureScalePercent / 100;

    if (!floorplan || floorplan.length > MAX_IMAGE_LENGTH) return json({ error: 'The floorplan image is too large after downscaling. Try a smaller file.' }, 400);
    const match = floorplan.match(/^data:(image\/(?:png|jpeg));base64,(.+)$/);
    if (!match) return json({ error: 'The floorplan must be a PNG or JPEG data URL.' }, 400);
    if (!(style in STYLE_DIRECTIONS)) return json({ error: 'Choose a valid floorplan render style.' }, 400);
    if (!rooms.length) return json({ error: 'At least one detected room with a floor material is required.' }, 400);

    const schedule = rooms.map((room, index) => {
      const polygon = Array.isArray(room.polygon)
        ? room.polygon.slice(0, 40).map((point) => `${safeCoordinate(point?.x)},${safeCoordinate(point?.y)}`).join(' | ')
        : '';
      const moduleWidthM = Math.max(0.01, Math.min(3, Number(room.moduleWidthM) || 0.2));
      const moduleLengthM = Math.max(0.01, Math.min(3, Number(room.moduleLengthM) || moduleWidthM));
      const renderedWidthM = moduleWidthM * textureScaleMultiplier;
      const renderedLengthM = moduleLengthM * textureScaleMultiplier;
      const patternAngleDeg = Number.isFinite(Number(room.patternAngleDeg)) ? Number(room.patternAngleDeg) : 0;
      return `${index + 1}. ROOM: ${String(room.name || `Room ${index + 1}`).slice(0, 100)}\n   FLOOR: ${String(room.materialName || 'unspecified floor').slice(0, 160)}; COLOR: ${String(room.materialColor || 'as scheduled').slice(0, 100)}; CHARACTER: ${String(room.specification || '').slice(0, 260)}\n   SOURCE PRODUCT MODULE: ${String(room.textureModule || 'generic material module').slice(0, 120)}\n   RENDERED MODULE AT ${textureScalePercent}%: ${renderedWidthM.toFixed(3)} m × ${renderedLengthM.toFixed(3)} m. Its width must appear ${(renderedWidthM / doorWidthM * 100).toFixed(1)}% of a ${doorWidthM.toFixed(2)} m door leaf width in the same depth plane. Across one door-leaf width, show approximately ${(doorWidthM / renderedWidthM).toFixed(1)} module widths; never render fewer repeats by enlarging the texture.\n   PATTERN ORIENTATION: ${patternAngleDeg.toFixed(1)} degrees in source-plan coordinates; ${String(room.alignmentRule || 'aligned to the longest room wall').slice(0, 140)}.\n   NORMALIZED POLYGON (x,y in percent of source image): ${polygon || 'not supplied'}`;
    }).join('\n');

    const prompt = `Reconstruct the supplied black-and-white architectural floorplan as exactly one complete, presentation-quality styled floorplan. This is a full-plan architectural reconstruction, not a floor-color overlay.

STRUCTURE LOCK — SOURCE ACCURACY OVERRIDES STYLE:
1. First trace and lock the source architecture before applying any visual treatment.
2. Preserve the exact exterior footprint, interior room count, room adjacency, circulation, wall centerlines, wall lengths, wall thicknesses, wall junctions, columns, shafts, voids, and balconies.
3. Preserve every opening on the same wall and at the same relative position and width: doors, door swings, windows, sliding panels, and passages.
4. Preserve stairs, fixed cabinetry, kitchen and bathroom fixtures, plumbing symbols, and any source-visible furniture or plan symbols at their exact locations and scale.
5. Do not merge, subdivide, enlarge, shrink, mirror, rotate, crop, reinterpret, tidy, or redesign any part of the plan. Do not create an alternate layout.
6. Keep the entire footprint visible with generous margin. Never clip an exterior wall or rendered volume.
7. Existing labels and dimensions may remain in top-down watercolor. For isometric outputs, omit text only when necessary for legibility; never replace it with invented text.
8. Do not add people, plants, furniture, decoration, windows, doors, rooms, or fixtures that are not explicitly shown in the source.

PHYSICAL TEXTURE SCALE — CALIBRATED FROM DOORS:
- Treat a typical detected door leaf in the source as exactly ${doorWidthM.toFixed(2)} m wide. Use it as the visual scale ruler for every material texture.
- Global texture scale is ${textureScalePercent}% (${textureScaleMultiplier.toFixed(2)}× physical product size). This changes only the visible material pattern/module size; it must never change rooms, walls, doors, furniture, or any architectural geometry.
- At 100%, render every plank, herringbone piece, carpet tile/weave, tile, grout grid, and aggregate pattern at the physical module dimensions in the room schedule.
- In top-down output, preserve the stated module-to-door ratio directly. In isometric output, preserve the same ratio in world space and allow only normal projection foreshortening; materials and the adjacent door must share the same perspective plane.
- The explicit repeat count across one door width is a minimum visual scale check. Do not simplify a floor by drawing fewer, larger planks or tiles.
- Keep plank widths consistent between rooms using the same material. Avoid oversized boards, tiles, grout grids, carpet weave, stone veining, or terrazzo aggregate. Herringbone piece scale is already calibrated and must not be enlarged or reduced unless the user changes the global texture slider.
- Follow each room's supplied pattern orientation. Run wood planks and herringbone along the detected longest-wall axis. Rotate square tile grids to that same architectural axis and center the grid within the room instead of starting with an arbitrary partial tile. Preserve these world-space directions in isometric projections.

The detected room polygons below are hard spatial masks for material placement and an additional geometry cross-check. They do not permit changing a room boundary. Apply the scheduled finish only inside its matching room, keep every edge inside the surrounding walls, and never paint or texture across a wall.

ROOM FLOOR MATERIAL SCHEDULE:
${schedule}

VISUAL STYLE:
${STYLE_DIRECTIONS[style]}

The output must be immediately recognizable as the identical source building. Recreate the WHOLE floorplan—including its walls, openings, fixed elements, and scheduled room floors—in the selected style. If style and geometry conflict, reduce the style effect and preserve geometry. Render a complete, unclipped composition; for top-down watercolor retain the source aspect ratio, and for isometric styles fit the full reconstructed footprint within the canvas.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    let apiResponse: Response;
    try {
      apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(MODEL)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GOOGLE_API_KEY },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: match[1], data: match[2] } }] }],
          generationConfig: {
            responseModalities: ['IMAGE'],
            responseFormat: { image: { imageSize: 'IMAGE_SIZE_ONE_K' } },
          },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const payload = await apiResponse.json();
    if (!apiResponse.ok) return json({ error: payload?.error?.message || `Image API returned ${apiResponse.status}.` }, apiResponse.status);

    const parts = payload?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((part: any) => part?.inlineData?.data || part?.inline_data?.data);
    const inlineData = imagePart?.inlineData || imagePart?.inline_data;
    if (!inlineData?.data) {
      const explanation = parts.map((part: any) => part?.text).filter(Boolean).join(' ').slice(0, 500);
      return json({ error: explanation || 'The image model did not return a floorplan image.' }, 502);
    }

    return json({
      image: `data:${inlineData.mimeType || inlineData.mime_type || 'image/png'};base64,${inlineData.data}`,
      model: MODEL,
      promptVersion: PROMPT_VERSION,
      style,
      conceptOnly: true,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return json({ error: 'Floorplan rendering timed out after 120 seconds.' }, 504);
    return json({ error: error instanceof Error ? error.message : 'Unexpected floorplan-rendering error.' }, 500);
  }
};
