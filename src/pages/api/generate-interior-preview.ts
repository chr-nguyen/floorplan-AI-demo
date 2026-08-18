import type { APIRoute } from 'astro';

const GOOGLE_API_KEY = import.meta.env.GOOGLE_API_KEY;
const MODEL = import.meta.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
const MAX_IMAGE_LENGTH = 3_400_000;

interface PreviewItem {
  section?: string;
  name?: string;
  specification?: string;
  color?: string;
  code?: string;
  status?: string;
  exactProductConfirmed?: boolean;
}

const PROMPT_VERSION = 'interior-preview-accuracy-v2';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export const POST: APIRoute = async ({ request }) => {
  if (!GOOGLE_API_KEY) return json({ error: 'GOOGLE_API_KEY is not configured on the server.' }, 503);

  try {
    const body = await request.json();
    const sourcePhoto = typeof body.sourcePhoto === 'string' ? body.sourcePhoto : '';
    const room = String(body.room || 'Living / Dining / Kitchen').slice(0, 120);
    const style = String(body.style || 'Natural modern').slice(0, 120);
    const note = String(body.note || '').slice(0, 800);
    const items: PreviewItem[] = Array.isArray(body.items) ? body.items.slice(0, 30) : [];

    if (!sourcePhoto || sourcePhoto.length > MAX_IMAGE_LENGTH) return json({ error: 'The room photo is too large after downscaling. Try a smaller file.' }, 400);
    const match = sourcePhoto.match(/^data:(image\/(?:png|jpeg));base64,(.+)$/);
    if (!match) return json({ error: 'The room photo must be a PNG or JPEG data URL.' }, 400);
    if (!items.length) return json({ error: 'At least one selected material is required.' }, 400);

    const schedule = items.map((item, index) => {
      const code = item.code && item.exactProductConfirmed
        ? `; confirmed manufacturer product code: ${item.code}`
        : item.code
          ? `; internal POC reference only (not a manufacturer SKU): ${item.code}`
          : '; exact maker and product code are not confirmed';
      return `${index + 1}. [${item.section || 'item'} / ${item.status || 'selection'}] ${item.name || 'Unnamed item'} — ${item.specification || ''}; color/design intent: ${item.color || ''}${code}`;
    }).join('\n');

    const prompt = `You are editing an existing-room photograph for a Japanese residential sales meeting.

INPUT IMAGE: a photograph of the customer's existing room. Treat it as the fixed source image, not loose inspiration.
TARGET ROOM: ${room}
DESIGN DIRECTION: ${style}
CUSTOMER BRIEF: ${note || 'Create a calm, practical, welcoming home interior.'}

SELECTED MATERIAL, FIXTURE, AND REFERENCE-FURNITURE SCHEDULE:
${schedule}

Return exactly one photorealistic edited version of the INPUT IMAGE. Preserve the original camera position, crop, perspective, room dimensions, ceiling height, wall planes, doors, windows, openings, built-ins, and exterior view. Do not redesign the architecture or create another room. Replace only the applicable visible finishes and fixtures with the selected design intent. Add selected reference furniture and accessories once each at realistic Japanese residential scale, with correct perspective, contact shadows, and clear circulation. Keep existing objects when the customer brief says to retain them; otherwise remove only objects that conflict with the selected additions. Do not add unselected furniture or decorative clutter. Apply material colors and physical character faithfully. When an exact product is not confirmed, visualize the generic description without inventing a brand-specific appearance. Treat any supplied product codes as identifiers only. Do not render labels, codes, callouts, legends, measurements, or any text. Match the source lighting and produce a believable real-estate photograph. This is a concept visualization, not a construction drawing or a guarantee of exact product appearance.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    let apiResponse: Response;
    try {
      apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(MODEL)}:generateContent`, {
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
            responseModalities: ['IMAGE'],
            // The raw v1 REST schema accepts protobuf enum names here. The
            // human-readable "1K" value shown in SDK examples is normalized
            // by the SDK, but is rejected when sent directly. Aspect ratio is
            // omitted so the model follows the source room photo's framing.
            responseFormat: {
              image: {
                imageSize: 'IMAGE_SIZE_ONE_K',
              },
            },
          },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const payload = await apiResponse.json();
    if (!apiResponse.ok) {
      const message = payload?.error?.message || `Image API returned ${apiResponse.status}.`;
      return json({ error: message }, apiResponse.status);
    }

    const parts = payload?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((part: any) => part?.inlineData?.data || part?.inline_data?.data);
    const inlineData = imagePart?.inlineData || imagePart?.inline_data;
    if (!inlineData?.data) {
      const explanation = parts.map((part: any) => part?.text).filter(Boolean).join(' ').slice(0, 500);
      return json({ error: explanation || 'The image model did not return an image.' }, 502);
    }

    return json({
      image: `data:${inlineData.mimeType || inlineData.mime_type || 'image/png'};base64,${inlineData.data}`,
      model: MODEL,
      conceptOnly: true,
      promptVersion: PROMPT_VERSION,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return json({ error: 'Image generation timed out after 120 seconds.' }, 504);
    return json({ error: error instanceof Error ? error.message : 'Unexpected preview-generation error.' }, 500);
  }
};
