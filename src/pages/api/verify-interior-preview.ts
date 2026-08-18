import type { APIRoute } from 'astro';

const GOOGLE_API_KEY = import.meta.env.GOOGLE_API_KEY;
const MODEL = import.meta.env.GEMINI_VISION_MODEL || 'gemini-3.6-flash';
const MAX_IMAGE_LENGTH = 1_600_000;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const imagePart = (value: unknown) => {
  const source = typeof value === 'string' ? value : '';
  if (!source || source.length > MAX_IMAGE_LENGTH) return undefined;
  const match = source.match(/^data:(image\/(?:png|jpeg));base64,(.+)$/);
  return match ? { mimeType: match[1], data: match[2] } : undefined;
};

export const POST: APIRoute = async ({ request }) => {
  if (!GOOGLE_API_KEY) return json({ error: 'GOOGLE_API_KEY is not configured on the server.' }, 503);
  try {
    const body = await request.json();
    const source = imagePart(body.sourcePhoto);
    const rendered = imagePart(body.renderedImage);
    if (!source || !rendered) return json({ error: 'Valid source and rendered images are required.' }, 400);
    const items = Array.isArray(body.items) ? body.items.slice(0, 30).map((item) => String(item).slice(0, 180)) : [];
    const prompt = `Audit an AI-edited interior preview against its source photograph and requested schedule.

Image 1 is the source room. Image 2 is the generated preview.
Requested visible changes:
${items.map((item, index) => `${index + 1}. ${item}`).join('\n') || 'No schedule supplied.'}

Check whether camera position, crop, perspective, wall planes, ceiling height, doors, windows, openings, built-ins, and exterior view remain structurally consistent. Check whether requested finishes/items are plausibly represented, whether an item is duplicated, and whether unrelated architecture or furniture was invented. Do not reward photorealism when geometry changed. Return a strict audit; uncertainty should lower the score.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    let response: Response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GOOGLE_API_KEY },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: source }, { inlineData: rendered }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'object',
              properties: {
                structureScore: { type: 'number' },
                scheduleScore: { type: 'number' },
                structurePreserved: { type: 'boolean' },
                selectedItemsPresent: { type: 'boolean' },
                issues: { type: 'array', items: { type: 'string' } },
                missingItems: { type: 'array', items: { type: 'string' } },
                unexpectedChanges: { type: 'array', items: { type: 'string' } },
              },
              required: ['structureScore', 'scheduleScore', 'structurePreserved', 'selectedItemsPresent', 'issues', 'missingItems', 'unexpectedChanges'],
            },
          },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const payload = await response.json();
    if (!response.ok) return json({ error: payload?.error?.message || `Gemini returned ${response.status}.` }, response.status);
    const text = payload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text).filter(Boolean).join('') || '';
    if (!text) return json({ error: 'The verification model did not return an audit.' }, 502);
    const parsed = JSON.parse(text);
    const structureScore = Math.max(0, Math.min(100, Math.round(Number(parsed.structureScore) || 0)));
    const scheduleScore = Math.max(0, Math.min(100, Math.round(Number(parsed.scheduleScore) || 0)));
    const issues = Array.isArray(parsed.issues) ? parsed.issues.slice(0, 12).map((issue: unknown) => String(issue).slice(0, 240)) : [];
    const missingItems = Array.isArray(parsed.missingItems) ? parsed.missingItems.slice(0, 12).map((issue: unknown) => String(issue).slice(0, 180)) : [];
    const unexpectedChanges = Array.isArray(parsed.unexpectedChanges) ? parsed.unexpectedChanges.slice(0, 12).map((issue: unknown) => String(issue).slice(0, 180)) : [];
    const hardFailure = parsed.structurePreserved !== true || structureScore < 65;
    const pass = !hardFailure && structureScore >= 85 && scheduleScore >= 75 && unexpectedChanges.length === 0;

    return json({
      verification: {
        status: hardFailure ? 'fail' : pass ? 'pass' : 'review',
        structureScore,
        scheduleScore,
        structurePreserved: parsed.structurePreserved === true,
        selectedItemsPresent: parsed.selectedItemsPresent === true,
        issues,
        missingItems,
        unexpectedChanges,
        model: MODEL,
        verifierType: 'independent-ai-review-requires-human-confirmation',
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return json({ error: 'Preview verification timed out after 60 seconds.' }, 504);
    return json({ error: error instanceof Error ? error.message : 'Unexpected preview-verification error.' }, 500);
  }
};
