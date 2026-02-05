# AI Floorplan to 3D Model Generator

A web application that transforms 2D floorplan images into 3D models using AI. Built with [Astro](https://astro.build), [React](https://react.dev), and [Fal.ai](https://fal.ai).

## 🚀 How It Works

This application runs a multi-step AI pipeline to convert a flat image into an interactive 3D scene:

1.  **Masking (SAM2)**: Uses Segment Anything Model 2 to identify and isolate the floorplan from the background.
2.  **Depth Estimation (ZoeDepth)**: Generates a depth map from the 2D image to understand spatial geometry.
3.  **3D Generation (Trellis)**: Converts the image + depth info into a 3D mesh (`.glb` format).
4.  **Stylization (Flux)**: (Optional) Takes a snapshot of the 3D view and re-renders it with high-quality architectural styles.

## 🛠️ Technology Stack

*   **Frontend Framework**: Astro + React
*   **3D Rendering**: `@react-three/fiber` & `@react-three/drei`
*   **AI Inference**: Fal.ai (Trellis, Flux, SAM2, ZoeDepth)
*   **Deployment**: Static Site (GitHub Pages compatible)

## 📦 Deployment (GitHub Pages)

This project is configured for static deployment on GitHub Pages.

### Prerequisites

1.  **Fal.ai API Key**: You need an API key from [fal.ai](https://fal.ai/dashboard).
2.  **GitHub Repository**: Push this code to a GitHub repository.

### Setup Instructions

1.  **Environment Variables**:
    Since GitHub Pages is a static host, the API key must be embedded in the build.
    *   Create a file named `.env` in the root (if running locally).
    *   Add your key: `PUBLIC_FAL_KEY="your-fal-key-here"`
    *   **Security Warning**: This key will be visible to anyone who inspects the website network traffic. This is acceptable for personal demos but strictly not for production apps without a backend proxy.

2.  **Build & Deploy**:

    **Option A: Manual Upload**
    1.  Run `npm install`
    2.  Run `npm run build`
    3.  Upload the contents of the `dist/` folder to your server or `gh-pages` branch.

    **Option B: GitHub Actions**
    1.  Go to your GitHub Repo > Settings > Secrets and Variables > Actions.
    2.  Add a New Repository Secret: `PUBLIC_FAL_KEY` with your key value.
    3.  The project includes a standard Astro build setup. You may need to add a `.github/workflows/deploy.yml` file to automate this (standard Astro GitHub Pages workflow).

## 💻 Local Development

1.  Clone the repo.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Set up `.env`:
    ```bash
    PUBLIC_FAL_KEY="your-key"
    ```
4.  Start the dev server:
    ```bash
    npm run dev
    ```
