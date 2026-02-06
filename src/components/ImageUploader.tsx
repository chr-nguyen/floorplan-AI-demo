import React, { useState, useRef, createRef } from 'react';
import { fal } from "@fal-ai/client";
import ModelViewer, { type ModelViewerRef } from './ModelViewer';
import './ImageUploader.css';

// For GitHub Pages demo: Use client-side key directly
if (!import.meta.env.PUBLIC_FAL_KEY) {
  console.error("CRITICAL: PUBLIC_FAL_KEY is missing from environment variables.");
}

fal.config({
  credentials: import.meta.env.PUBLIC_FAL_KEY,
});

type PipelineStep = 'idle' | 'masking' | 'depth' | 'modeling' | 'rerendering' | 'complete' | 'error';

interface ImageItem {
  url: string;
  file: File;
  loading: boolean; // General loading state
  result3d?: string;
  // Floorplan specific
  pipelineStep: PipelineStep;
  maskUrl?: string;
  depthUrl?: string;
  capturedUrl?: string;
  rerenderUrl?: string;
  pipelineLog?: string[];
  stylizePrompt?: string;
}


const STYLE_PRESETS = [
  {
    name: "Modern Minimalist",
    prompt: "Modern minimalist interior, clean lines, white walls, light oak wood, large windows, natural light, decluttered, airy, architectural photography, 8k"
  },
  {
    name: "Warm Scandinavian",
    prompt: "Scandinavian interior design, hygge, warm lighting, cozy atmosphere, beige tones, textured fabrics, soft shadows, wooden accents, inviting, photorealistic"
  },
  {
    name: "Industrial Loft",
    prompt: "Industrial loft style, exposed brick walls, concrete floors, black metal accents, high ceilings, dramatic lighting, leather furniture, raw materials, 8k render"
  },
  {
    name: "Luxury Classic",
    prompt: "Luxury classic interior, elegant molding, crystal chandeliers, velvet furniture, gold accents, rich colors, sophisticated, magazine quality, high detail"
  },
  {
    name: "Biophilic Oasis",
    prompt: "Biophilic interior design, abundant indoor plants, green walls, natural materials, sunlight, organic shapes, peaceful, zen atmosphere, architectural digest style"
  }
];

export default function ImageUploader() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('fal-ai/trellis');

  // Refs for ModelViewers to capture screenshots
  const modelViewerRefs = useRef<(ModelViewerRef | null)[]>([]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newImages = Array.from(files).map((file) => ({
        url: URL.createObjectURL(file),
        file: file,
        loading: false,
        pipelineStep: 'idle' as PipelineStep,
        pipelineLog: []
      }));
      setImages((prev) => [...prev, ...newImages]);
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => {
      const newImages = [...prev];
      URL.revokeObjectURL(newImages[index].url);
      newImages.splice(index, 1);
      return newImages;
    });
  };

  const updateImageState = (index: number, updates: Partial<ImageItem>) => {
    setImages(prev => prev.map((img, i) => i === index ? { ...img, ...updates } : img));
  };

  const runFalModel = async (model: string, input: any, index: number, logMsg: string, options: { logs?: boolean } = {}) => {
    updateImageState(index, {
      pipelineLog: [...(images[index].pipelineLog || []), `> ${logMsg}...`]
    });

    const result: any = await fal.subscribe(model, {
      input,
      logs: options.logs ?? true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          console.log(`${model} in progress...`);
        }
      },
    });
    return result;
  };

  /* 
     NEW PIPELINE: Depth-Displacement
     1. Upload specific optimized image
     2. Get Depth Map (ZoeDepth)
     3. Render 3D Plane with Displacement (Client-side)
  */
  const generate3D = async (index: number) => {
    const image = images[index];
    if (image.loading) return; // Only stop if currently loading. Allow redo if complete/idle.

    // Clear previous 3D results to show spinner again (User Request: "clear that image state")
    updateImageState(index, { loading: true, pipelineStep: 'idle', result3d: undefined });

    try {
      const storageUrl = await fal.storage.upload(image.file);

      // Step 1: ZoeDepth (Legacy support + Depth visualization)
      updateImageState(index, { pipelineStep: 'depth' });
      console.log("Step 1: Estimate Depth (ZoeDepth)");

      let depthUrl = image.depthUrl; // Reuse existing depth if available? 
      // User asked to "redo steps", but reusing depth is efficient. 
      // However, to strictly "clear state", we should probably re-run or at least allow the UI to look fresh.
      // Let's re-run only if missing, BUT since we want to allow "Redo", maybe we force re-run?
      // For now, let's keep it optimized: Reuse depthURL if it exists to save time/money, unless we want to force distinct "Retry".
      // Actually, if the depth map was bad, user might want to retry. Let's force re-run if we cleared it?
      // I kept depthUrl in the updateImageState above (didn't clear it). So it will be reused.

      if (!depthUrl) {
        try {
          const depthResult = await runFalModel('fal-ai/image-preprocessors/zoe', { image_url: storageUrl }, index, "Step 1: Generating Depth Map");
          // @ts-ignore
          depthUrl = depthResult.image?.url || depthResult.depth_map?.url || depthResult.images?.[0]?.url;

          if (depthUrl) {
            updateImageState(index, { depthUrl });
          } else {
            console.warn("ZoeDepth skipped (no URL). Proceeding...", depthResult);
          }
        } catch (e) {
          console.warn("ZoeDepth step failed. Proceeding...", e);
        }
      }

      // Step 2: SAM3D / Trellis (Generative 3D)
      updateImageState(index, { pipelineStep: 'modeling' });
      console.log("Step 2: 3D Generation (Trellis)");

      const modelResult = await runFalModel(selectedModel, { image_url: storageUrl }, index, "Step 2: Final 3D Model", { logs: false });

      // @ts-ignore
      const meshUrl = modelResult.data?.model_mesh?.url || modelResult.model_mesh?.url || modelResult.images?.[0]?.url;

      if (meshUrl) {
        updateImageState(index, { loading: false, result3d: meshUrl, pipelineStep: 'complete' });
      } else {
        throw new Error("No mesh URL in response");
      }

    } catch (error) {
      console.error("Error generating:", error);
      updateImageState(index, { loading: false, pipelineStep: 'error' });
      alert("Failed to generate. Check console.");
    }
  };

  const handleCapture = (index: number) => {
    const viewer = modelViewerRefs.current[index];
    if (!viewer) {
      alert("Could not access 3D viewer. Please try again.");
      return;
    }

    const screenshotDataUrl = viewer.captureScreenshot();
    if (!screenshotDataUrl) {
      alert("Failed to capture screenshot.");
      return;
    }

    // Just display the captured image for verification
    updateImageState(index, { capturedUrl: screenshotDataUrl, rerenderUrl: undefined }); // Clear previous render if re-capturing
  };

  const handleStylize = async (index: number) => {
    const image = images[index];
    if (!image.capturedUrl) {
      alert("No captured image to stylize.");
      return;
    }

    // Clear previous render to show spinner
    updateImageState(index, { pipelineStep: 'rerendering', rerenderUrl: undefined });

    try {
      // 1. Upload captured view (Structure reference)
      const blob = await (await fetch(image.capturedUrl)).blob();
      const file = new File([blob], "captured_view.png", { type: "image/png" });
      const capturedStorageUrl = await fal.storage.upload(file);

      // 2. Upload original floorplan (Style/Color reference) -> SKIPPED (Reverted to simple pipeline for stability)
      // const originalStorageUrl = await fal.storage.upload(image.file);

      console.log("Step 6: Stylizing with Flux Dev (Stable)");

      const defaultPrompt = "soft lighting, ray tracing, photorealistic, professional, award-winning, natural lighting, sharp focus. Add realistic lighting, and even out the tops of the walls to be more uniform, finally clean up the textures to look more realistic";

      const prompt = image.stylizePrompt + ", " + defaultPrompt;

      const requestInput = {
        image_url: capturedStorageUrl,
        prompt: prompt,
        strength: 0.75, // Lower strength (0.7) to prevent hallucinations and stick closer to the 3D shape
        guidance_scale: 2.5,
        num_inference_steps: 40,
        enable_safety_checker: false,
        output_format: "jpeg"
      };

      console.log('DEBUG: Flux Request Input:', requestInput);

      // Use standard Flux Dev Image-to-Image (Most reliable)
      const rerenderResult = await runFalModel('fal-ai/flux/dev/image-to-image', requestInput, index, "Step 6: Stylizing View (Flux Dev)");

      // Extract image URL
      // @ts-ignore
      const rerenderUrl = rerenderResult.images?.[0]?.url || rerenderResult.data?.images?.[0]?.url || rerenderResult.image?.url || rerenderResult.url;

      if (rerenderUrl) {
        updateImageState(index, { rerenderUrl, pipelineStep: 'complete' });
      } else {
        throw new Error("No output image returned from Flux");
      }

    } catch (e) {
      console.error("Stylize failed:", e);
      updateImageState(index, { pipelineStep: 'error' });
      alert("Stylize failed. Check console.");
    }
  };

  const handlePromptChange = (index: number, newPrompt: string) => {
    updateImageState(index, { stylizePrompt: newPrompt });
  };

  return (
    <div className="uploader-wrapper">
      <div className="uploader-container">
        <label className="upload-btn">
          Upload Floorplan
          <input
            type="file"
            accept="image/png, image/jpeg, image/jpg"
            multiple
            onChange={handleImageUpload}
            className="file-input"
          />
        </label>

        {images.length > 0 && (
          <div className="results-list">
            {images.map((img, index) => (
              <div key={index} className="result-row">

                {/* Pipeline Layout (Always Active) */}
                <div style={{ width: '100%' }}>
                  <div style={{ marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>
                    <strong>Pipeline Status:</strong> {img.pipelineStep.toUpperCase()}
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column', paddingBottom: '1rem' }}>
                    {/* Original */}
                    <div style={{ minWidth: '200px', position: 'relative' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#444' }}>1. Original</div>
                      <img src={img.url} className="image-preview-full" alt="Original Floorplan" />
                    </div>

                    <button
                      onClick={() => generate3D(index)}
                      disabled={img.loading || img.pipelineStep === 'rerendering'}
                      style={{
                        marginTop: '0.5rem',
                        fontSize: '0.9rem',
                        padding: '10px 20px',
                        background: '#0070f3', // Distinct purple color
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        width: '100%',
                        opacity: (img.loading || img.pipelineStep === 'rerendering') ? 0.7 : 1
                      }}
                    >
                      {img.loading ? '⏳ Generating 3D Model...' : (img.result3d ? '🔄 Redo 3D Model' : '📦 Render to 3D Model')}
                    </button>

                    {/* Mask (Step 1) */}
                    {/* {(img.maskUrl || img.pipelineStep === 'masking') && (
                      <div style={{ minWidth: '200px', flex: 1, opacity: img.pipelineStep === 'masking' ? 0.5 : 1 }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#444' }}>2. SAM2D Mask</div>
                        {img.maskUrl ? (
                          <img src={img.maskUrl} className="image-preview-full" alt="Mask" />
                        ) : (
                          <div style={{ height: '200px', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Running SAM2 Auto...</div>
                        )}
                      </div>
                    )} */}

                    {/* Depth (Step 2) */}
                    {/* {(img.depthUrl || img.pipelineStep === 'depth') && (
                      <div style={{ minWidth: '200px', flex: 1, opacity: img.pipelineStep === 'depth' ? 0.5 : 1 }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#444' }}>3. ZoeDepth Map</div>
                        {img.depthUrl ? (
                          <img src={img.depthUrl} className="image-preview-full" alt="Depth Map" />
                        ) : (
                          <div style={{ height: '200px', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Running ZoeDepth...</div>
                        )}
                      </div>
                    )} */}

                    {/* Final 3D (Step 3) */}
                    {(img.result3d || ['masking', 'depth', 'modeling'].includes(img.pipelineStep)) && (
                      <div style={{ minWidth: '300px', width: '100%' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#444' }}>2. create 3D Model</div>

                        <div style={{ position: 'relative' }}>
                          <div className="model-viewer-wrapper">
                            {img.result3d ? (
                              <ModelViewer
                                ref={el => { modelViewerRefs.current[index] = el; }}
                                modelUrl={img.result3d}
                              />
                            ) : (
                              <div className="loading-overlay">
                                <div className="spinner"></div>
                                <div className="status-text">
                                  {img.pipelineStep === 'masking' && 'Step 1/3: Analyzing Floorplan (Optimized)...'}
                                  {img.pipelineStep === 'depth' && 'Step 1/2: Generating Depth Map...'}
                                  {img.pipelineStep === 'modeling' && 'Step 2/2: Generating 3D Mesh (Trellis)...'}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Capture Button - Only show when result is ready */}
                          {img.result3d && (
                            <button
                              onClick={() => handleCapture(index)}
                              style={{
                                marginTop: '0.5rem',
                                fontSize: '0.8rem',
                                padding: '10px 20px',
                                background: '#0070f3',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                width: '100%',
                              }}
                            >
                              📸 Capture View
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Capture Result (Step 5) */}
                    {(img.capturedUrl) && (
                      <div style={{ minWidth: '200px', flex: 1 }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#444' }}>3. Captured View</div>
                        <div style={{ position: 'relative' }}>
                          <img src={img.capturedUrl} className="image-preview-full" alt="Captured View" />
                        </div>

                        {/* Style Presets */}
                        {/* <div className="preset-grid">
                          {STYLE_PRESETS.map((preset) => (
                            <button
                              key={preset.name}
                              className="preset-btn"
                              onClick={() => handlePromptChange(index, preset.prompt)}
                            >
                              {preset.name}
                            </button>
                          ))}
                        </div> */}

                        <textarea
                          className="prompt-textarea"
                          placeholder="Enter stylization prompt (e.g. 'Modern interior, sunny day')..."
                          value={img.stylizePrompt || "Take this dollhouse view and create a hyper-realistic architectural photography, interior design masterpiece, 8k, highly detailed, soft lighting, ray tracing"}
                          onChange={(e) => updateImageState(index, { stylizePrompt: e.target.value })}
                        />

                        <button
                          onClick={() => handleStylize(index)}
                          disabled={img.pipelineStep === 'rerendering'}
                          style={{
                            marginTop: '0.5rem',
                            fontSize: '0.9rem',
                            padding: '10px 20px',
                            background: '#0070f3', // Distinct purple color
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            width: '100%',
                            opacity: img.pipelineStep === 'rerendering' ? 0.7 : 1
                          }}
                        >
                          {img.pipelineStep === 'rerendering' ? '✨ Stylizing (Flux)...' : '✨ Stylize with Flux'}
                        </button>
                      </div>
                    )}

                    {/* Stylized Result (Step 6) */}
                    {(img.rerenderUrl || img.pipelineStep === 'rerendering') && (
                      <div style={{ width: '100%' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#444' }}>4. Stylized Render</div>
                        {img.rerenderUrl ? (
                          <div style={{ position: 'relative' }}>
                            <img src={img.rerenderUrl} className="image-preview-full" alt="Stylized Render" />
                          </div>
                        ) : (
                          <>
                            <div className="placeholder-box" style={{ height: '500px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}><div className="spinner"></div><p>Creating photorealistic render...</p></div>
                          </>
                        )}
                      </div>
                    )}

                  </div>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


