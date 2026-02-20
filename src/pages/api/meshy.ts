import type { APIRoute } from 'astro';

const MESHY_API_KEY = import.meta.env.MESHY_KEY;

export const POST: APIRoute = async ({ request }) => {
  if (!MESHY_API_KEY) {
    return new Response(JSON.stringify({ error: "Server Configuration Error: API Key missing" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const body = await request.json();

    // Validate body structure briefly (optional but good practice)
    if (!body.image_url) {
      return new Response(JSON.stringify({ error: "Missing image_url" }), { status: 400 });
    }

    const response = await fetch("https://api.meshy.ai/v1/image-to-3d", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MESHY_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify(data), { status: response.status });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("3D Proxy Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
};

export const GET: APIRoute = async ({ request }) => {
  if (!MESHY_API_KEY) {
    return new Response(JSON.stringify({ error: "Server Configuration Error: API Key missing" }), {
      status: 500,
    });
  }

  const url = new URL(request.url);
  const taskId = url.searchParams.get('taskId');
  const pageNum = url.searchParams.get('page_num') || '1';
  const pageSize = url.searchParams.get('page_size') || '10';

  try {
    let meshyUrl = `https://api.meshy.ai/v1/image-to-3d/${taskId}`;

    if (!taskId) {
      // Fetch history if no taskId is provided
      meshyUrl = `https://api.meshy.ai/v1/image-to-3d?page_num=${pageNum}&page_size=${pageSize}`;
    }

    const response = await fetch(meshyUrl, {
      headers: {
        "Authorization": `Bearer ${MESHY_API_KEY}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify(data), { status: response.status });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}
