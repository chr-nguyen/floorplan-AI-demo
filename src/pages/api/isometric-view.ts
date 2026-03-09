import type { APIRoute } from 'astro';
import { GoogleGenerativeAI } from '@google/generative-ai';

const GOOGLE_API_KEY = import.meta.env.GOOGLE_API_KEY;

export const POST: APIRoute = async ({ request }) => {
  if (!GOOGLE_API_KEY) {
    return new Response(JSON.stringify({ error: "Server Config Error: GOOGLE_API_KEY missing" }), { status: 500 });
  }

  try {
    const body = await request.json();
    const { image } = body;

    if (!image) {
      return new Response(JSON.stringify({ error: "Missing image data" }), { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ model: "nano-banana-pro-preview" });

    const base64Data = image.split(',')[1] || image;

    const prompt = `Convert this top-down floor plan into a photorealistic isometric 3D architectural rendering viewed from a 45-degree angle above.

Requirements:
- Show FULL 10-foot wall height from floor to ceiling on all walls
- Above every door opening: include at least 2 feet of solid wall between the top of the door frame and the ceiling
- Above every window: include at least 2 feet of solid wall between the top of the window frame and the ceiling — windows must NOT extend to the ceiling
- Windows should be positioned mid-wall height, not flush with ceiling
- No roof — leave the ceiling open so the interior layout is visible from above
- Show all room divisions, corridors, and wall intersections clearly
- Keep all furniture, fixtures, and interior objects exactly as shown in the original floor plan
- White matte walls, light concrete or hardwood floors
- Clean, bright rendering style with no shadows obscuring wall heights
- The result should look like a physical architectural scale model photographed from above at 45 degrees
Return ONLY the image.`;

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: "image/png",
      },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;

    const parts = response.candidates?.[0]?.content?.parts;
    const returnedImagePart = parts?.find((p: any) => p.inlineData);

    if (returnedImagePart && returnedImagePart.inlineData) {
      const mimeType = returnedImagePart.inlineData.mimeType;
      const data = returnedImagePart.inlineData.data;
      return new Response(JSON.stringify({
        isometric_image: `data:${mimeType};base64,${data}`
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Fallback: return original if no image generated
    return new Response(JSON.stringify({
      isometric_image: image,
      note: "Isometric conversion returned no image — using input as fallback."
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("Isometric View API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};
