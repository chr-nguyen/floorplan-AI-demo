
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
dotenv.config();

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

if (!GOOGLE_API_KEY) {
  console.error("Error: GOOGLE_API_KEY not found in environment variables.");
  process.exit(1);
}

async function listModels() {
  const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
  // Note: listModels is not directly exposed on the instance in some versions of the SDK, 
  // but often available via the API standard. 
  // Actually, the node SDK usually exposes it differently or relies on known model strings.
  // However, we can try to hit the REST endpoint if the SDK doesn't make it easy.

  // Let's try the REST endpoint directly for listing models.
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${GOOGLE_API_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.models) {
      console.log("Available Models:");
      data.models.forEach(model => {
        console.log(`- ${model.name} (Methods: ${model.supportedGenerationMethods})`);
      });
    } else {
      console.log("No models found or error structure:", data);
    }
  } catch (error) {
    console.error("Error listing models:", error);
  }
}

listModels();
