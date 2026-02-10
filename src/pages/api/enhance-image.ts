
import type { APIRoute } from 'astro';
import { GoogleGenerativeAI } from '@google/generative-ai';

const GOOGLE_API_KEY = import.meta.env.GOOGLE_API_KEY;

export const POST: APIRoute = async ({ request }) => {
  if (!GOOGLE_API_KEY) {
    return new Response(JSON.stringify({ error: "Server Config Error: GOOGLE_API_KEY missing" }), { status: 500 });
  }

  try {
    const body = await request.json();
    const { image, prompt: userPrompt } = body; // Expects base64 string (data:image/...) and optional prompt

    if (!image) {
      return new Response(JSON.stringify({ error: "Missing image data" }), { status: 400 });
    }

    // Use the specific model requested by the user (Nano Banana)
    const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ model: "nano-banana-pro-preview" });

    // Prepare image part
    // Strip header if present (data:image/png;base64,)
    const base64Data = image.split(',')[1] || image;

    // Construct a prompt that explicitly asks for IMAGE GENERATION based on the input
    // "Enhance" might be interpreted as "Describe how to enhance". 
    // "Generate a..." triggers the image generator.
    const prompt = userPrompt
      ? `Generate a high-quality image of this floorplan based on these instructions: ${userPrompt}. The original image is a floorplan diagram, not a photograph, doors to the outside are represented as with an angle and a swing arc line, closet doors are represented as a W as if it's an accordian door. Make the walls realistically seem like 10 foot walls with wall space above the windows and doors, do not represent only half the walls, show at least 2 feet of wall above the windows and doors as well. Remove all text from the image. Add the appropriate colors for the rooms and furniture, and give it a 3D birdseye view from above. Return ONLY the image.`
      : "Generate a high-quality, enhanced version of this floorplan image. Increase contrast, sharpen lines, remove noise, and define walls clearly. The original image is a floorplan diagram, not a photograph, doors to the outside are represented as with an angle and a swing arc line, closet doors are represented as a W as if it's an accordian door. Make the walls realistically seem like 10 foot walls with wall space above the windows and doors, do not represent only half the walls, show at least 2 feet of wall above the windows and doors as well. Remove all text from the image. Add the appropriate colors for the rooms and furniture, and give it a 3D birdseye view from above. Return ONLY the image.";

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: "image/png",
      },
    };

    // Generate content using Gemini 2.0 Flash
    // Note: We need to use a model that supports image generation/editing if available.
    // 'gemini-2.0-flash-exp' is multimodal.

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;

    // Important: For image generation, the response might not have 'text()'.
    let text = "";
    try {
      text = response.text();
      console.log("Gemini Response Text:", text);
    } catch (e) {
      console.log("No text returned (expected for pure image response).");
    }

    // Check if the response contains any inline image data 
    // Gemini API returns generated images in the 'candidates' array, specialized parts.

    const parts = response.candidates?.[0]?.content?.parts;
    // Look for executable code or inline data
    const returnedImagePart = parts?.find(p => p.inlineData);
    // OR sometimes it provides a URI if it's a large file, but usually inline for this size.

    if (returnedImagePart && returnedImagePart.inlineData) {
      const mimeType = returnedImagePart.inlineData.mimeType;
      const data = returnedImagePart.inlineData.data;
      const base64Image = `data:${mimeType};base64,${data}`;

      return new Response(JSON.stringify({
        enhanced_image: base64Image,
        note: "Enhanced by AI"
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // If no image returned, it might be that the model just described the enhancement.
    // We will throw an error to let the user know, OR we return the original with the *text description* as a note.
    // But the user wants the image modified. 

    // IF we are here, it means we didn't get an image back.
    // Let's try to simulate the effect by applying a CSS filter in frontend? 
    // NO, that's cheating.

    // We will return the original but include the text response so the user sees what AI *thought*.
    return new Response(JSON.stringify({
      enhanced_image: image,
      note: `AI Output (No image returned): ${text}`
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};
