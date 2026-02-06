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

This project includes a **GitHub Actions workflow** (`.github/workflows/deploy.yml`) that automatically builds and deploys the site to GitHub Pages whenever you push to the `main` branch.

### 🚀 Setup Instructions

1.  **Push to GitHub**: Ensure your code is in a GitHub repository.
2.  **Configure Secrets (Critical)**:
    - Go to your Repository **Settings** > **Secrets and variables** > **Actions**.
    - Click **New repository secret**.
    - **Name**: `PUBLIC_FAL_KEY`
    - **Value**: Your Fal.ai API key (e.g., `123-abc...`).
    - *Note: This is required because the build process needs the key to bundle it into the static site.*

3.  **Enable GitHub Pages**:
    - Go to **Settings** > **Pages**.
    - Under **Build and deployment** > **Source**, select **GitHub Actions**.
    - (The workflow will handle the rest on the next push).

4.  **Deploy**:
    - Just push a commit to `main`, and the "Deploy to GitHub Pages" action will run automatically.


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
