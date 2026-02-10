
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response("Missing URL param", { status: 400 });
  }

  try {
    // Fetch the asset from the external provider (Meshy)
    const response = await fetch(targetUrl);

    if (!response.ok) {
      return new Response(`Failed to fetch remote asset: ${response.status}`, { status: response.status });
    }

    // Get the blob (binary data)
    const blob = await response.blob();

    // Serve it back with open CORS headers
    return new Response(blob, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*", // Allow all origins (including localhost)
        "Content-Type": response.headers.get("Content-Type") || "model/gltf-binary",
        "Cache-Control": "public, max-age=3600" // Cache for performance
      }
    });

  } catch (error: any) {
    console.error("Proxy Error:", error);
    return new Response(`Proxy failed: ${error.message}`, { status: 500 });
  }
};
