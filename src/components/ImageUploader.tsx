import React, { useState, useRef, createRef } from 'react';
import { fal } from "@fal-ai/client";
import ModelViewer, { type ModelViewerRef } from './ModelViewer';
import './ImageUploader.css';

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
  loading: boolean;
  result3d?: string;
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
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  const [meshyPolycount, setMeshyPolycount] = useState<number>(20000);
  const [meshySymmetry, setMeshySymmetry] = useState<string>('off');
  const [trellisTextureSize, setTrellisTextureSize] = useState<number>(1024);

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
    if (image.loading) return;

    updateImageState(index, { loading: true, pipelineStep: 'idle', result3d: undefined });

    try {
      const storageUrl = await fal.storage.upload(image.file);

      updateImageState(index, { pipelineStep: 'depth' });
      console.log("Step 1: Estimate Depth (ZoeDepth)");

      let depthUrl = image.depthUrl;


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

      // Step 2: SAM3D / Trellis / Meshy (Generative 3D)
      updateImageState(index, { pipelineStep: 'modeling' });
      const modelName = selectedModel.includes('meshy') ? "Meshy V6" : "Trellis";
      console.log(`Step 2: 3D Generation (${modelName})`);

      // Prepare input based on model
      const modelInput: any = { image_url: storageUrl };

      if (selectedModel.includes('meshy')) {
        // Meshy V6 Specifics
        modelInput.enable_pbr = true;
        modelInput.topology = "triangle"; // Default
        modelInput.target_polycount = meshyPolycount;
        modelInput.symmetry_mode = meshySymmetry;
        modelInput.should_remesh = true;
      } else {
        // Trellis Specifics
        modelInput.texture_size = trellisTextureSize;
        modelInput.mesh_simplify = 0.95; // Default
      }

      console.log(`Using Params:`, modelInput);

      const modelResult = await runFalModel(selectedModel, modelInput, index, `Step 2: Final 3D Model (${modelName})`, { logs: false });

      console.log("Full Model Result:", JSON.stringify(modelResult, null, 2));

      // @ts-ignore
      // Robust URL extraction for various models (Trellis vs Meshy)
      const meshUrl =
        // Direct access
        modelResult.model_mesh?.url ||
        modelResult.model_urls?.glb?.url ||
        modelResult.model_glb?.url ||
        // Wrapped in data object
        modelResult.data?.model_mesh?.url ||
        modelResult.data?.model_urls?.glb?.url ||
        modelResult.data?.model_glb?.url ||
        // Fallbacks
        modelResult.images?.[0]?.url ||
        modelResult.mesh?.url;

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

                    {/* Model Selector */}
                    <div style={{ marginBottom: '0.5rem' }}>
                      <label style={{ fontSize: '0.9rem', fontWeight: 600, color: '#444', marginRight: '0.5rem' }}>3D Engine:</label>
                      <select
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        disabled={img.loading || img.pipelineStep === 'rerendering'}
                        style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc' }}
                      >
                        <option value="fal-ai/trellis">Trellis (Fast)</option>
                        <option value="fal-ai/meshy/v6-preview/image-to-3d">Meshy V6 (High Quality)</option>
                      </select>

                      {/* Advanced Settings Toggle */}
                      <button
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        style={{
                          display: 'block',
                          margin: '0.5rem 0 0 0',
                          background: 'none',
                          border: 'none',
                          color: '#666',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          textDecoration: 'underline'
                        }}
                      >
                        {showAdvanced ? 'Hide Advanced Settings' : 'Show Advanced Settings'}
                      </button>

                      {showAdvanced && (
                        <div style={{
                          marginTop: '0.5rem',
                          padding: '0.8rem',
                          background: '#f8f9fa',
                          border: '1px solid #eee',
                          borderRadius: '6px',
                          fontSize: '0.85rem'
                        }}>
                          {selectedModel.includes('meshy') ? (
                            <>
                              <div style={{ marginBottom: '0.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '2px', fontWeight: 500 }}>Detail (Poly Count):</label>
                                <select
                                  value={meshyPolycount}
                                  onChange={(e) => setMeshyPolycount(Number(e.target.value))}
                                  style={{ width: '100%', padding: '4px' }}
                                >
                                  <option value={20000}>Low (20k) - Fastest</option>
                                  <option value={30000}>Medium (30k) - Balanced</option>
                                  <option value={50000}>High (50k) - Best Quality</option>
                                </select>
                              </div>
                              <div style={{ marginBottom: '0.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '2px', fontWeight: 500 }}>Symmetry:</label>
                                <select
                                  value={meshySymmetry}
                                  onChange={(e) => setMeshySymmetry(e.target.value)}
                                  style={{ width: '100%', padding: '4px' }}
                                >
                                  <option value="off">OFF (Recommended for Floorplans)</option>
                                  <option value="auto">Auto (Default)</option>
                                  <option value="on">Force On</option>
                                </select>
                                <small style={{ display: 'block', color: '#666', marginTop: '2px' }}>Force OFF prevents the AI from mirroring your room.</small>
                              </div>
                            </>
                          ) : (
                            <div>
                              <label style={{ display: 'block', marginBottom: '2px', fontWeight: 500 }}>Texture Quality:</label>
                              <select
                                value={trellisTextureSize}
                                onChange={(e) => setTrellisTextureSize(Number(e.target.value))}
                                style={{ width: '100%', padding: '4px' }}
                              >
                                <option value={1024}>Standard (1024px)</option>
                                <option value={2048}>High Res (2048px)</option>
                              </select>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => generate3D(index)}
                      disabled={img.loading || img.pipelineStep === 'rerendering'}
                      style={{
                        marginTop: '0.5rem',
                        fontSize: '0.9rem',
                        padding: '10px 20px',
                        background: selectedModel.includes('meshy') ? '#7928CA' : '#0070f3', // Purple for Meshy, Blue for Trellis
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        width: '100%',
                        opacity: (img.loading || img.pipelineStep === 'rerendering') ? 0.7 : 1,
                        transition: 'background 0.3s ease'
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
                                  {img.pipelineStep === 'modeling' && 'Step 2/2: Generating 3D Mesh...'}
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


