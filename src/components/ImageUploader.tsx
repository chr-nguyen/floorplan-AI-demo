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

  const generate3D = async (index: number) => {
    const image = images[index];
    if (image.loading || image.result3d) return;

    updateImageState(index, { loading: true, pipelineStep: 'idle' });

    try {
      const storageUrl = await fal.storage.upload(image.file);

      // --- FLOORPLAN PIPELINE (Default) ---

      // Step 1: SAM2D (Masking)
      updateImageState(index, { pipelineStep: 'masking' });
      console.log("Step 1: Masking (SAM2 Auto-Segment)");
      const maskResult = await runFalModel('fal-ai/sam2/auto-segment', { image_url: storageUrl }, index, "Step 1: Masking (SAM2 Auto)");

      // @ts-ignore
      const maskUrl = maskResult.mask_url || maskResult.image?.url || maskResult.images?.[0]?.url;
      if (maskUrl) updateImageState(index, { maskUrl });


      // Step 2: ZoeDepth (Depth Map)
      updateImageState(index, { pipelineStep: 'depth' });
      console.log("Step 2: Depth (ZoeDepth)");
      const depthResult = await runFalModel('fal-ai/image-preprocessors/zoe', { image_url: storageUrl }, index, "Step 2: Depth (ZoeDepth)");
      // @ts-ignore
      const depthUrl = depthResult.depth_map?.url || depthResult.image?.url;
      if (depthUrl) updateImageState(index, { depthUrl });


      // Step 3: SAM3D / Refinement
      updateImageState(index, { pipelineStep: 'modeling' });
      console.log("Step 3: 3D Generation");

      // Disable logs for Trellis to avoid potential JSON parsing errors on large log chunks
      const modelResult = await runFalModel(selectedModel, { image_url: storageUrl }, index, "Step 3: Final 3D Model", { logs: false });

      // @ts-ignore
      const meshUrl = modelResult.data?.model_mesh?.url || modelResult.model_mesh?.url;

      if (meshUrl) {
        updateImageState(index, { loading: false, result3d: meshUrl, pipelineStep: 'complete' });
        // History saving removed for static deployment
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
    updateImageState(index, { capturedUrl: screenshotDataUrl });
  };

  const handleStylize = async (index: number) => {
    const image = images[index];
    if (!image.capturedUrl) {
      alert("No captured image to stylize.");
      return;
    }

    updateImageState(index, { pipelineStep: 'rerendering' });

    try {
      // Convert Data URL to Blob for upload
      const blob = await (await fetch(image.capturedUrl)).blob();
      const file = new File([blob], "captured_view.png", { type: "image/png" });
      const storageUrl = await fal.storage.upload(file);

      // Send to Flux Image-to-Image
      console.log("Step 6: Stylizing with Flux");

      const prompt = image.stylizePrompt || "Take this dollhouse view and create a hyper-realistic architectural photography, interior design masterpiece, 8k, highly detailed, soft lighting, ray tracing";
      const requestInput = {
        image_url: storageUrl,
        prompt: prompt,
        strength: 0.75
      };

      console.log('DEBUG: Flux Request Input:', requestInput);

      const rerenderResult = await runFalModel('fal-ai/flux/dev/image-to-image', requestInput, index, "Step 6: Stylizing View (Flux)");

      // Extract image URL - Flux/Dev usually returns { images: [{ url: ... }] }
      // @ts-ignore
      const rerenderUrl = rerenderResult.images?.[0]?.url || rerenderResult.data?.images?.[0]?.url || rerenderResult.image?.url || rerenderResult.url;

      if (rerenderUrl) {
        updateImageState(index, { rerenderUrl, pipelineStep: 'complete' });
      } else {
        throw new Error("No output image returned from Nano Banana");
      }

    } catch (e) {
      console.error("Stylize failed:", e);
      updateImageState(index, { pipelineStep: 'error' });
      alert("Stylize failed. Check console.");
    }
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
                      {(img.maskUrl || img.pipelineStep === 'masking' || img.depthUrl || img.pipelineStep === 'depth') ? '📦 Rendering to 3D Model...' : '📦 Render to 3D Model'}
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
                                  {img.pipelineStep === 'masking' && 'Step 1/3: Analyzing Floorplan (SAM2)...'}
                                  {img.pipelineStep === 'depth' && 'Step 2/3: Estimating Depth (ZoeDepth)...'}
                                  {img.pipelineStep === 'modeling' && 'Step 3/3: Generating 3D Mesh...'}
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
                          <div className="placeholder-box" style={{ height: '500px' }}>Creating photorealistic render...</div>
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


