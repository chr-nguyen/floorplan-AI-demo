
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

    // Initialize Gemini
    // Using the same model as the enhancement step for consistency
    const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ model: "nano-banana-pro-preview" });

    const base64Data = image.split(',')[1] || image;

    // Prompt specifically for photorealistic rendering of the 3D screenshot
    const prompt = "Generate a photorealistic version of this 3D model screenshot. Make it look like a real photograph of an interior space. Improve lighting, textures, and shadows to be highly realistic. Maintain the perspective and layout exactly. Return ONLY the image.";

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: "image/png",
      },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;

    let text = "";
    try {
      text = response.text();
      console.log("Gemini Render Response Text:", text);
    } catch (e) {
      console.log("No text returned (expected for pure video/image response).");
    }

    const parts = response.candidates?.[0]?.content?.parts;
    const returnedImagePart = parts?.find(p => p.inlineData);

    if (returnedImagePart && returnedImagePart.inlineData) {
      const mimeType = returnedImagePart.inlineData.mimeType;
      const data = returnedImagePart.inlineData.data;
      const base64Image = `data:${mimeType};base64,${data}`;

      return new Response(JSON.stringify({
        rendered_image: base64Image,
        message: "Photorealistic render generated"
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({
      rendered_image: image, // Return original if generation failed
      message: `AI Output (No image returned): ${text}`
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("Render API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};
