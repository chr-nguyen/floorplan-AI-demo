import type { APIRoute } from 'astro';

const GOOGLE_API_KEY = import.meta.env.GOOGLE_API_KEY;
const MODEL = import.meta.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
const MAX_IMAGE_LENGTH = 3_400_000;
const PROMPT_VERSION = 'floorplan-whole-plan-finishes-furniture-palette-v8';

type RenderStyle = 'watercolor' | 'soft-marker' | 'japanese-brochure' | '3d-render' | 'photorealistic' | 'photo-dollhouse';

interface RenderRoom {
  name?: string;
  materialName?: string;
  materialColor?: string;
  specification?: string;
  wallMaterialName?: string;
  wallMaterialColor?: string;
  wallSpecification?: string;
  wallSwatchHex?: string;
  wallIsAccent?: boolean;
  textureModule?: string;
  moduleWidthM?: number;
  moduleLengthM?: number;
  patternAngleDeg?: number;
  alignmentRule?: string;
  polygon?: Array<{ x?: number; y?: number }>;
}

const STYLE_DIRECTIONS: Record<RenderStyle, string> = {
  watercolor: 'Recreate the COMPLETE plan as a refined top-down architectural watercolor. Redraw all walls, wall cuts, openings, doors, windows, stairs, columns, built-ins, sanitary fixtures, and source-visible plan symbols. Colour every element — scheduled floors and walls, joinery, fixtures, and source-visible furniture — with translucent washes, subtle paper texture, restrained shadows, and precise ink linework. Keep the same orthographic top-down projection as the source.',
  'soft-marker': 'Recreate the COMPLETE plan as a professional hand-rendered soft-marker plan in the same orthographic top-down projection. Use restrained alcohol-marker strokes over every element — scheduled floors and walls, joinery, fixtures, and source-visible furniture — with gentle tonal variation, fine architectural ink outlines, soft gray cast shadows, and clean white wall cuts. Keep materials legible and presentation-ready without loose sketch distortion.',
  'japanese-brochure': 'Recreate the COMPLETE plan as a bright Japanese residential sales-brochure floorplan in the same orthographic top-down projection. Use crisp dark-gray architectural linework, clean white wall cuts, pale realistic floor and wall finishes, lightly coloured joinery, fixtures and source-visible furniture, considered colour accents on furniture and textiles, subtle depth shadows, excellent room separation, and generous white space. Prioritize clarity, cleanliness, and immediate sales-plan legibility.',
  '3d-render': 'Reconstruct the COMPLETE plan as a clean isometric architectural cutaway. Extrude only the walls and architectural elements that exist in the source, with consistent wall heights and open ceilings. Use a true axonometric/isometric camera at a restrained elevated angle, realistic scheduled floor and wall finishes on every surface, finished joinery, fixtures and source-visible furniture, and soft ambient occlusion. The projection may change, but footprint, topology, room count, adjacency, wall geometry, and every opening must remain identical.',
  photorealistic: 'Reconstruct the COMPLETE plan as a polished material-focused isometric CG cutaway. Favor clear, consistent product textures on every surface — scheduled floors and walls, joinery, fixtures, and source-visible furniture alike — with controlled studio lighting, soft ambient occlusion, and brochure-quality computer-rendered materials. It should look intentionally like a premium architectural visualization rather than a photograph.',
  'photo-dollhouse': 'Reconstruct the COMPLETE plan as a genuinely photorealistic isometric dollhouse/cutaway photographed as a real miniature architectural model. Render physically plausible wall surfaces, glazing, doors, fixed cabinetry, plumbing fixtures, and source-visible furniture symbols at their exact locations. Use ray-traced natural light, realistic contact shadows, lens-consistent depth, high-frequency material detail, and photographic exposure. Avoid the smooth plastic look of generic CG. Add nothing not explicitly present in the source.',
};

const STYLE_FURNITURE_DIRECTIONS: Record<RenderStyle, string> = {
  watercolor: 'Paint each object with the same translucent watercolor washes used for the floors and walls: soft pigment edges, gentle granulation, visible paper tooth, and a fine ink outline. Pigments may be rich and deeply saturated as long as they stay slightly earthy: layered ochre and sienna for timber, a confident single-pigment wash for each upholstered piece (indigo, olive, terracotta, plum), layered greens for planting, a pale grey-blue wash with a white highlight for glass. Build depth with a second wash rather than by desaturating. No CG shading, no smooth gradients, no plastic sheen.',
  'soft-marker': 'Block each object in with alcohol-marker tones: two or three tonal steps per object, consistent stroke direction, a crisp ink outline, and a soft grey cast shadow. Let the textiles carry real marker colour — deep teal, rust, olive, mustard — against warm tans for timber and light cool greys for metal and glass. Reserve the palest tones for the finishes, not the furniture. Objects should read as hand-rendered, not airbrushed.',
  'japanese-brochure': 'Fill each object with the pale, clean, lightly saturated tones a sales brochure uses, outlined in thin dark grey. Every object must be identifiable at a glance at small print size: light woods, white sanitaryware, muted greenery, and upholstery in clear considered colour — a sage sofa, a clay armchair, an indigo bed — kept a shade lighter than it would be in a photograph so the linework stays crisp. Colour the furniture confidently; just keep the room finishes paler than the furniture so the plan stays legible.',
  '3d-render': 'Give each object a physically plausible CG material: matte woven fabric for upholstery and bedding, satin timber with grain running along the object\'s long axis, brushed or matte metal for legs and handles, glazed ceramic for sanitaryware, clear glass with a soft reflection for tabletops, real foliage for planting. Give upholstery and rugs genuine colour — forest, petrol, ochre, burgundy — rather than defaulting to grey fabric. Light everything from the same source with soft ambient occlusion and consistent contact shadows.',
  photorealistic: 'Give each object premium product-visualisation materials with correct roughness and sheen per surface: fabric with a visible weave at true scale, timber with real grain and pore direction, metal with soft specular falloff, ceramic with a glazed highlight, glass with accurate transmission. Materials carry the realism and colour carries the interest: use deep, considered upholstery hues and real timber species rather than neutral placeholders, keeping the whole plan inside two or three accent families.',
  'photo-dollhouse': 'Render each object as a photographed real material: upholstery with visible fibre and seams, bedding with soft wrinkles and a cast shadow into the mattress, timber with authentic grain and edge wear, metal with true specular highlights, glass with reflection and refraction, planting with individual leaves. Keep exposure and white balance identical across the whole model so every room looks photographed in one shot.',
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
      const wallHex = /^#[0-9a-fA-F]{3,8}$/.test(String(room.wallSwatchHex || '')) ? String(room.wallSwatchHex) : '';
      return `${index + 1}. ROOM: ${String(room.name || `Room ${index + 1}`).slice(0, 100)}\n   FLOOR: ${String(room.materialName || 'unspecified floor').slice(0, 160)}; COLOR: ${String(room.materialColor || 'as scheduled').slice(0, 100)}; CHARACTER: ${String(room.specification || '').slice(0, 260)}\n   WALLS: ${String(room.wallMaterialName || 'unspecified wallcovering').slice(0, 160)}; COLOR: ${String(room.wallMaterialColor || 'as scheduled').slice(0, 100)}${wallHex ? ` (approximately ${wallHex})` : ''}; CHARACTER: ${String(room.wallSpecification || '').slice(0, 260)}; ${room.wallIsAccent ? 'Treat as a deliberate accent finish: apply it to this room\'s wall surfaces so it clearly reads as different from the neighbouring rooms.' : 'Treat as a quiet base finish: keep it soft and even so accent rooms stand out against it.'}\n   SOURCE PRODUCT MODULE: ${String(room.textureModule || 'generic material module').slice(0, 120)}\n   RENDERED MODULE AT ${textureScalePercent}%: ${renderedWidthM.toFixed(3)} m × ${renderedLengthM.toFixed(3)} m. Its width must appear ${(renderedWidthM / doorWidthM * 100).toFixed(1)}% of a ${doorWidthM.toFixed(2)} m door leaf width in the same depth plane. Across one door-leaf width, show approximately ${(doorWidthM / renderedWidthM).toFixed(1)} module widths; never render fewer repeats by enlarging the texture.\n   PATTERN ORIENTATION: ${patternAngleDeg.toFixed(1)} degrees in source-plan coordinates; ${String(room.alignmentRule || 'aligned to the longest room wall').slice(0, 140)}.\n   NORMALIZED POLYGON (x,y in percent of source image): ${polygon || 'not supplied'}`;
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

ROOM FINISH SCHEDULE:
${schedule}

WHOLE-PLAN COLOR TREATMENT — COLOR EVERY ELEMENT, ADD NOTHING:
- Nothing in the drawing may be left as flat uncolored line-art or as a grey placeholder. Every surface and every symbol that exists in the source is rendered in the selected style, at the same level of finish as the floors.
- WALLS: give each room's wall surfaces its scheduled wallcovering. In top-down output, colour the visible inner wall faces and any wall thickness that reads as a surface, keeping the wall cuts themselves clean and legible. In isometric output, the inner faces of the extruded walls carry the scheduled colour and character; keep the wall cut edges crisp so the plan stays readable. Where two rooms share a wall, each side takes its own room's finish.
- JOINERY AND OPENINGS: doors, door leaves, sliding panels, frames, window frames, glazing, thresholds, and stair treads and risers are all finished — glazing reads as glass, timber reads as timber, and metal reads as metal, all in the selected style.
- BUILT-INS AND FIXTURES: kitchen cabinetry, countertops, wardrobes, closet interiors, shelving, sanitary fixtures, bathtubs, basins, WCs, and appliances are all coloured with plausible material tone and sheen, harmonised with the room's scheduled floor and wall.
- FURNITURE AND ACCESSORIES ALREADY IN THE SOURCE: every furniture symbol, rug, curtain, bed, sofa, table, chair, planter, and decorative element visible in the source drawing is rendered as a finished object with its own material and colour. Do NOT invent, add, duplicate, move, resize, or reposition any of them, and do not fill an empty room with furniture. If a room has no furniture in the source, it stays empty.
- EXTERIOR AND CIRCULATION: balconies, terraces, entry steps, corridors, and any exterior ground shown in the source are finished consistently rather than left blank.
- PALETTE COHERENCE: the whole plan must read as one designed scheme. Derive the base palette from the scheduled floors and walls, keep fixtures and joinery inside it, and let the furniture and textiles extend it with the accent hues described below rather than being confined to the finish colours. Vary tone and material between rooms enough to tell them apart, but never so much that the drawing looks like separate images stitched together. Keep the same object type consistent across rooms unless the source clearly shows it differently.
- The colour treatment is subordinate to geometry: it may never move, resize, merge, or invent an element in order to look better.

FURNITURE AND OBJECT COLOR LOGIC — REALISTIC, AND IN THE SELECTED MEDIUM:
- Identify what each symbol actually is before colouring it, then give it the colour and material that object would really have. A dining table and its chairs read as timber; a sofa and armchairs as upholstery fabric; a bed as a timber or upholstered frame with textile bedding; a rug as pile textile; curtains as hanging fabric with soft folds; a planter as a ceramic or woven pot with real foliage; a TV as a dark matte screen; appliances as steel or white enamel; a bathtub, basin, and WC as glazed white ceramic; tabletops and shower screens as glass. Never colour an object arbitrarily, and never colour-code furniture like a diagram legend or key.
- Relate every object to its room's scheduled floor and wall, and keep enough tonal separation to stay legible against the floor beneath it — a sofa must never dissolve into the floor, and a rug must never merge with the floor it sits on. Aim for a clear light-mid-dark reading between floor, furniture, and accessories.
- COLOUR THE FURNITURE LIKE A DESIGNER, NOT A DEFAULT. Give each room a deliberate three-part colour story: a dominant tone on the largest pieces, a secondary tone carrying real chroma, and one or two smaller true accents. A room whose furniture is entirely beige, grey, greige, or white has failed this instruction.
- Draw from a sophisticated interior palette of deep, slightly desaturated hues rather than pale neutrals: terracotta, rust, burnt orange, ochre, mustard, olive, sage, moss, forest green, teal, petrol blue, denim, indigo, navy, plum, aubergine, burgundy, oxblood, clay, camel, caramel, chocolate, ink, charcoal. Rich muted versions of these read as designed; washed-out or pastel versions read as cheap.
- A large upholstered piece may absolutely carry a real colour — a forest-green or petrol-blue sofa, an ochre armchair, a burgundy or indigo bed, a rust rug — provided its tone still separates cleanly from the floor under it. Do not default the biggest object in the room to a neutral.
- Make the materials as interesting as the hues: bouclé, linen, wool, velvet, tanned leather, cane and rattan, painted timber, walnut, oak, marble, travertine, brass, blackened steel, ceramic, glass. Two objects sharing a hue should differ in material and sheen.
- Give each room its own accent hue so the plan never reads monochrome, but keep the whole plan harmonious: pick two or three accent hue families for the entire floorplan and repeat them across rooms rather than giving every room an unrelated colour.
- Let textiles and painted timber carry most of the colour. Keep sanitaryware white, appliances steel or white, and screens dark.
- Restrained does not mean timid, but never garish: no neon, fluorescent, or saturated primary poster colours; no more than three accent hue families in the whole plan; no rainbow effect and no colour-coding by room. Aim for the palette of a good interiors magazine, not a children's illustration.
- Timber objects should relate to the scheduled wood finishes rather than fight them: either visibly the same wood family, or a clearly different, deliberate tone. Avoid a near-miss wood tone that reads as a mistake.
- The same object type keeps the same material and colour across every room unless the source drawing clearly shows a different one.
- Render every object in the medium and technique of the selected style, at the same level of finish as the room around it, so furniture never looks pasted in from a different drawing:
${STYLE_FURNITURE_DIRECTIONS[style]}

VISUAL STYLE:
${STYLE_DIRECTIONS[style]}

The output must be immediately recognizable as the identical source building. Recreate the WHOLE floorplan—its walls and wall finishes, openings, joinery, stairs, built-ins, fixtures, source-visible furniture and accessories, and the scheduled room floors—as one fully finished composition in the selected style. If style and geometry conflict, reduce the style effect and preserve geometry. Render a complete, unclipped composition; for top-down watercolor retain the source aspect ratio, and for isometric styles fit the full reconstructed footprint within the canvas.`;

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
