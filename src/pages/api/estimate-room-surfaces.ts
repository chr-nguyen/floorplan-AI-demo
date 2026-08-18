import type { APIRoute } from 'astro';

const GOOGLE_API_KEY = import.meta.env.GOOGLE_API_KEY;
const MODEL = import.meta.env.GEMINI_VISION_MODEL || 'gemini-3.6-flash';
const PROMPT_VERSION = 'photo-surface-suggestion-accuracy-v2';
const MAX_IMAGE_LENGTH = 3_400_000;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const finiteInRange = (value: unknown, min: number, max: number) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? Math.round(number * 10) / 10 : undefined;
};

export const POST: APIRoute = async ({ request }) => {
  if (!GOOGLE_API_KEY) return json({ error: 'GOOGLE_API_KEY is not configured on the server.' }, 503);

  try {
    const body = await request.json();
    const sourcePhoto = typeof body.sourcePhoto === 'string' ? body.sourcePhoto : '';
    const room = String(body.room || 'residential room').slice(0, 120);
    const assumedCeilingHeight = finiteInRange(body.assumedCeilingHeight, 2, 5) || 2.4;

    if (!sourcePhoto || sourcePhoto.length > MAX_IMAGE_LENGTH) return json({ error: 'The room photo is too large after downscaling. Try a smaller file.' }, 400);
    const match = sourcePhoto.match(/^data:(image\/(?:png|jpeg));base64,(.+)$/);
    if (!match) return json({ error: 'The room photo must be a PNG or JPEG data URL.' }, 400);

    const prompt = `Estimate finish quantities for the single residential room visible in this photograph.

Room type: ${room}
Assumed ceiling height used as the scale anchor: ${assumedCeilingHeight} metres.

Infer a plausible full-room width and depth from perspective, doors, windows, cabinetry, and common Japanese residential proportions. Estimate:
1. floorAreaM2: full floor finish area, not only the visible floor;
2. ceilingAreaM2: full ceiling finish area;
3. netWallAreaM2: total paint/wallpaper area for all room walls after roughly subtracting doors and windows;
4. roomWidthM and roomDepthM;
5. ceilingHeightM, which should normally equal the supplied anchor;
6. confidence: high, medium, or low;
7. short assumptions in Japanese and English.

Do not claim measurement accuracy. Prefer conservative, internally consistent values. Floor and ceiling area should normally be approximately width × depth. Wall area should normally be perimeter × height minus openings. Return only the requested structured result.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    let apiResponse: Response;
    try {
      apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GOOGLE_API_KEY },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { mimeType: match[1], data: match[2] } },
            ],
          }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'object',
              properties: {
                floorAreaM2: { type: 'number' },
                netWallAreaM2: { type: 'number' },
                ceilingAreaM2: { type: 'number' },
                roomWidthM: { type: 'number' },
                roomDepthM: { type: 'number' },
                ceilingHeightM: { type: 'number' },
                confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
                assumptionJa: { type: 'string' },
                assumptionEn: { type: 'string' },
              },
              required: ['floorAreaM2', 'netWallAreaM2', 'ceilingAreaM2', 'roomWidthM', 'roomDepthM', 'ceilingHeightM', 'confidence', 'assumptionJa', 'assumptionEn'],
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
    if (!responseText) return json({ error: 'Gemini did not return a surface estimate.' }, 502);

    const parsed = JSON.parse(responseText);
    const estimate = {
      floorAreaM2: finiteInRange(parsed.floorAreaM2, 2, 300),
      netWallAreaM2: finiteInRange(parsed.netWallAreaM2, 5, 1000),
      ceilingAreaM2: finiteInRange(parsed.ceilingAreaM2, 2, 300),
      roomWidthM: finiteInRange(parsed.roomWidthM, 1.5, 30),
      roomDepthM: finiteInRange(parsed.roomDepthM, 1.5, 30),
      ceilingHeightM: finiteInRange(parsed.ceilingHeightM, 2, 5),
      confidence: ['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : 'low',
      assumptionJa: String(parsed.assumptionJa || '写真と想定天井高からの概算です。').slice(0, 300),
      assumptionEn: String(parsed.assumptionEn || 'Approximation based on the photo and assumed ceiling height.').slice(0, 300),
      validationIssues: [] as string[],
      measurementStatus: 'unverified-ai-suggestion',
    };

    if (!estimate.floorAreaM2 || !estimate.netWallAreaM2 || !estimate.ceilingAreaM2 || !estimate.roomWidthM || !estimate.roomDepthM || !estimate.ceilingHeightM) {
      return json({ error: 'Gemini returned an incomplete or implausible surface estimate.' }, 502);
    }

    if (Math.abs(estimate.floorAreaM2 - estimate.ceilingAreaM2) / estimate.floorAreaM2 > 0.12) estimate.validationIssues.push('Floor and ceiling areas are inconsistent.');
    const rectangularArea = estimate.roomWidthM * estimate.roomDepthM;
    if (estimate.floorAreaM2 > rectangularArea * 1.15 || estimate.floorAreaM2 < rectangularArea * 0.55) estimate.validationIssues.push('Floor area is inconsistent with the reported room dimensions.');
    const grossWallArea = 2 * (estimate.roomWidthM + estimate.roomDepthM) * estimate.ceilingHeightM;
    if (estimate.netWallAreaM2 > grossWallArea) estimate.validationIssues.push('Net wall area exceeds the calculated gross wall area.');
    estimate.confidence = estimate.validationIssues.length ? 'low' : estimate.confidence === 'low' ? 'low' : 'medium';

    return json({ estimate, model: MODEL, promptVersion: PROMPT_VERSION, measurementType: 'ai-photo-estimate' });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return json({ error: 'Surface estimation timed out after 60 seconds.' }, 504);
    return json({ error: error instanceof Error ? error.message : 'Unexpected surface-estimation error.' }, 500);
  }
};
