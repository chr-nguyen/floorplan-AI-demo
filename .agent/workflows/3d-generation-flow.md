---
description: standard process for generating and enhancing 3D floorplan models
---

# 3D Generation Flow

This workflow defines the standard operating procedure for the 3D Floorplan Generator.

## 1. Initial Processing (New Image)
When a new floorplan image is uploaded:
- **Replace Context**: The new upload MUST replace the current active view entirely (clear current results).
- User is presented with TWO initial options:
    - **Enhance Image**: Clean up the 2D floorplan (remove furniture, etc.) using AI.
    - **Generate 3D Model**: Directly proceed to 3D model generation.
- After 3D generation is complete:
    - Proceed to **Snapshot Capture**.
    - Follow with **Photorealistic Rendering** (Enhanced Image).

## 2. History Reloading
When an item is selected from the "Recent 3D Designs" history:
- **Replace Context**: The historical item MUST replace the current active view entirely (clear current results).
- **Continuation**: Immediately open the 3D canvas and provide the steps for:
    - **Snapshot Capture**.
    - **Photorealistic Rendering** (Enhanced Image).
