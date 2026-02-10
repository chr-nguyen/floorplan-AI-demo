# AI Floorplan to 3D Model Generator

A web application that transforms 2D floorplan images into 3D models using AI. Built with [Astro](https://astro.build), [React](https://react.dev), and [Meshy API](https://meshy.ai).

## 🚀 How It Works

1.  **Image Upload**: User uploads a floorplan image.
2.  **Enhancement (Optional)**: The app enhances the 2D floorplan using **Google Gemini 2.0 Flash** via a secure proxy `/api/enhance-image`.
3.  **API Proxy**: The app securely sends the image to a Vercel Serverless Function `/api/meshy`.
4.  **3D Generation**: The server calls **Meshy API** to generate a 3D model (GLB).
5.  **Visualization**: Results are displayed in an interactive 3D viewer.

## 🛠️ Technology Stack

*   **Frontend**: Astro + React + Tailwind (CSS)
*   **3D Rendering**: `@react-three/fiber` & `@react-three/drei`
*   **AI Engine**: Meshy API (v1) & Google Gemini (2.0 Flash)
*   **Deployment**: Vercel (Serverless Functions)

## 📦 Deployment (Vercel)

This project is configured for **Vercel** to secure your API key using a server-side proxy.

1.  **Push to GitHub**.
2.  **Import in Vercel**.
3.  **Environment Variables**:
    - Add `MESHY_KEY` in Vercel Project Settings (Value: Your Meshy API Key).
    - Add `GOOGLE_API_KEY` in Vercel Project Settings (Value: Your Google Gemini API Key).
4.  **Deploy**.

## 🌐 How Vercel Integration Works

This project uses **Astro's Server-Side Rendering (SSR)** mode with the Vercel adapter to solve the problem of exposing API keys in client-side code.

### The Problem
In a standard React/static app (like GitHub Pages), all code is sent to the user's browser. If you use `MESHY_KEY` directly in React, anyone can view "Source" and steal your key to use your quota.

### The Solution: Serverless Proxy
We use Vercel Serverless Functions to create a secure "middleman":

1.  **Frontend (`ImageUploader.tsx`)**:
    -   Uploads the image and converts it to Base64.
    -   Sends a POST request to our *own* route: `/api/meshy`.
    -   **No API key** is present in the browser code.

2.  **Backend Proxy (`src/pages/api/meshy.ts`)**:
    -   This file runs only on Vercel's servers (or your local Node server).
    -   It reads `MESHY_KEY` from the secure environment variables.
    -   It attaches the key to the request header: `Authorization: Bearer <KEY>`.
    -   It forwards the request to `https://api.meshy.ai/...` and returns the result to the frontend.

Same logic applies to the **Google Gemini integration** (`/api/enhance-image`) using `GOOGLE_API_KEY`.

This architecture ensures your `MESHY_KEY` and `GOOGLE_API_KEY` never leave the server.

## 💻 Local Development

1.  Clone the repo.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Set up `.env`:
    Create a `.env` file in the root directory:
    ```bash
    MESHY_KEY="your-meshy-api-key"
    GOOGLE_API_KEY="your-google-gemini-api-key"
    ```
4.  Start the dev server:
    ```bash
    npm run dev
    ```
    The app will run at `http://localhost:4321`. The API proxy will be active at `/api/meshy` and `/api/enhance-image`.
