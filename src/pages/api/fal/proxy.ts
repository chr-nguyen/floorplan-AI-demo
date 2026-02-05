
import 'dotenv/config';
import type { APIRoute } from 'astro';
import { handleRequest } from '@fal-ai/server-proxy';

const handler: APIRoute = async ({ request }) => {
  const responseHeaders = new Headers();

  return await handleRequest({
    id: 'astro',
    method: request.method,
    getHeader: (key) => request.headers.get(key),
    getHeaders: () => {
      const headers: Record<string, string> = {};
      request.headers.forEach((value, key) => { headers[key] = value; });
      return headers;
    },
    getRequestBody: () => request.text(),
    respondWith: (status, body) => {
      return new Response(JSON.stringify(typeof body === 'string' ? { message: body } : body), {
        status,
        headers: { 'Content-Type': 'application/json' }
      });
    },
    sendHeader: (key, value) => {
      responseHeaders.set(key, value);
    },
    sendResponse: async (res) => {
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: responseHeaders
      });
    },
    resolveApiKey: () => {
      const key = process.env.FAL_KEY || import.meta.env.FAL_KEY;
      return Promise.resolve(key);
    },
  }, {
    allowedEndpoints: [
      'fal-ai/sam2/auto-segment',
      'fal-ai/image-preprocessors/zoe',
      'fal-ai/trellis',
      'fal-ai/flux/dev/image-to-image'
    ]
  });
};

export const POST = handler;
export const GET = handler;
