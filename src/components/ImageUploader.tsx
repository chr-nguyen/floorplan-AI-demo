import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import ModelViewer, { type ModelViewerRef } from './ModelViewer';
import './ImageUploader.css';

type PipelineStep = 'idle' | 'uploading' | 'enhancing' | 'processing' | 'complete' | 'error';

interface ImageItem {
  url: string;
  originalFile: File;
  enhancedUrl?: string; // URL of the enhanced 2D image
  enhancementPrompt?: string; // Custom user prompt for enhancement
  modelPrompt?: string;
  screenshotData?: string; // Data URL of the captured screenshot
  finalRenderUrl?: string; // URL of the enhanced photorealistic render
  loading: boolean;
  result3d?: string;
  pipelineStep: PipelineStep;
  pipelineLog?: string[];
  meshyTaskId?: string;
  selectedAction?: 'enhance' | '3d';
  isHistoryItem?: boolean;
}

export default function ImageUploader() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Meshy Configuration
  const [meshyPolycount, setMeshyPolycount] = useState<number>(30000);
  const [meshySymmetry, setMeshySymmetry] = useState<string>('off');
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  const modelViewerRefs = useRef<(ModelViewerRef | null)[]>([]);

  // Drag & Drop Handler
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles?.length > 0) {
      const newImages = acceptedFiles.map((file) => ({
        url: URL.createObjectURL(file),
        originalFile: file,
        loading: false,
        pipelineStep: 'idle' as PipelineStep,
        pipelineLog: [],
      }));
      setImages(newImages.slice(0, 1));
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const response = await fetch("/api/meshy");
      if (response.ok) {
        const data = await response.json();
        // Meshy v1 history is usually an array of tasks
        setHistoryItems(data.slice(0, 10));
      }
    } catch (error) {
      console.error("Failed to fetch history:", error);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const loadFromHistory = (item: any) => {
    const modelUrl = item.model_urls?.glb;
    if (!modelUrl) return;

    const proxiedUrl = `/api/proxy-model?url=${encodeURIComponent(modelUrl)}`;

    // Priority: generated thumbnail > original input image > base texture
    const displayUrl = item.thumbnail_url || item.image_url || item.texture_urls?.base_color || "";

    const newItem: ImageItem = {
      url: displayUrl,
      originalFile: new File([], "history-item"), // Dummy file
      result3d: proxiedUrl,
      pipelineStep: 'complete',
      pipelineLog: ['Loaded from history'],
      loading: false,
      selectedAction: '3d',
      isHistoryItem: true
    };

    setImages([newItem]);

    // Smooth scroll to results
    setTimeout(() => {
      window.scrollTo({ top: document.querySelector('.results-list')?.getBoundingClientRect().top ?? 0 + window.scrollY, behavior: 'smooth' });
    }, 100);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png']
    }
  });

  const removeImage = (index: number) => {
    setImages((prev) => {
      const newImages = [...prev];
      URL.revokeObjectURL(newImages[index].url);
      if (newImages[index].enhancedUrl) URL.revokeObjectURL(newImages[index].enhancedUrl!);
      newImages.splice(index, 1);
      return newImages;
    });
  };

  const updateImageState = (index: number, updates: Partial<ImageItem>) => {
    setImages(prev => prev.map((img, i) => i === index ? { ...img, ...updates } : img));
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const urlToBase64 = async (url: string): Promise<string> => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  }

  // ---------------------------------------------------------------------------
  // 1. Gemini: Enhance Image (Pre-process)
  // ---------------------------------------------------------------------------
  const handleEnhanceImage = async (index: number) => {
    const image = images[index];
    if (!image) return;

    updateImageState(index, {
      loading: true,
      pipelineStep: 'enhancing',
      pipelineLog: ['Enhancing image...'],
      selectedAction: 'enhance'
    });

    try {
      const base64Image = await fileToBase64(image.originalFile);

      const response = await fetch("/api/enhance-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: base64Image,
          prompt: image.enhancementPrompt
        })
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Enhancement failed");

      // The API returns base64 image data (or the original if simulated)
      // We create a Blob URL for display
      const enhancedBase64 = data.enhanced_image;

      // Convert Base64 back to Blob to create a URL
      const res = await fetch(enhancedBase64); // Works for data: URIs too
      const blob = await res.blob();
      const enhancedUrl = URL.createObjectURL(blob);

      updateImageState(index, {
        loading: false,
        enhancedUrl: enhancedUrl,
        pipelineStep: 'idle',
        pipelineLog: ['Image Enhanced!', ...(data.note ? [data.note] : [])]
      });

    } catch (error: any) {
      console.error("Enhance Error:", error);
      updateImageState(index, { loading: false, pipelineStep: 'error', pipelineLog: ['Enhancement failed.'] });
      alert(`Enhance Error: ${error.message}`);
    }
  };


  // ---------------------------------------------------------------------------
  // 2. Meshy: Generate 3D
  // ---------------------------------------------------------------------------
  const callMeshyAPI = async (index: number, skipEnhance: boolean = false) => {
    const image = images[index];
    if (!image) return;

    updateImageState(index, {
      loading: true,
      pipelineStep: 'uploading',
      result3d: undefined,
      pipelineLog: ['Preparing upload...'],
      // Only set selectedAction if it's not already set (e.g. from enhance)
      ...(images[index].selectedAction ? {} : { selectedAction: '3d' })
    });

    try {
      // USE ENHANCED IMAGE IF AVAILABLE, OTHERWISE ORIGINAL
      let base64Image;
      if (image.enhancedUrl && !skipEnhance) {
        console.log("Using Enhanced Image for 3D Generation");
        base64Image = await urlToBase64(image.enhancedUrl);
      } else {
        console.log("Using Original Image for 3D Generation");
        base64Image = await fileToBase64(image.originalFile);
      }

      updateImageState(index, { pipelineStep: 'processing', pipelineLog: ['Sending to 3D service...'] });

      const payload = {
        image_url: base64Image,
        enable_pbr: true,
        topology: "triangle",
        target_polycount: meshyPolycount,
        symmetry_mode: meshySymmetry,
        should_remesh: true,
        // User requested prompt for taller walls. 
        // Note: 'prompt' or 'refine_prompt' support varies by model version, but adding it as requested.
        prompt: "Realistic home interior, tall walls 10ft high relative to furniture, continuous walls above windows, high ceilings. Do not use shadows to orient the model. The view is always from the top looking down at the floor. Always have the floor be on the X Z plane, and the walls along Y axis. The floor is always on the bottom" + image.modelPrompt,
        texture_prompt: "Realistic interior textures, clear walls, high quality home finishing."
      };

      const response = await fetch("/api/meshy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`3D API Error (${response.status}): ${errText}`);
      }

      const data = await response.json();
      const taskId = data.result;

      if (!taskId) throw new Error("No Task ID returned");

      updateImageState(index, { meshyTaskId: taskId, pipelineLog: ['Task queued. Polling status...'] });

      // Polling
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/meshy?taskId=${taskId}`);
          if (!statusRes.ok) return;

          const statusData = await statusRes.json();
          const status = statusData.status;

          console.log(`Polling Task ${taskId}: ${status} (${statusData.progress}%)`);

          if (status === "SUCCEEDED") {
            clearInterval(pollInterval);
            const modelUrl = statusData.model_urls?.glb;

            if (modelUrl) {
              const proxiedUrl = `/api/proxy-model?url=${encodeURIComponent(modelUrl)}`;
              updateImageState(index, {
                loading: false,
                result3d: proxiedUrl,
                pipelineStep: 'complete',
                pipelineLog: ['Generation Complete!']
              });
            } else {
              throw new Error("Generation succeeded but no model found.");
            }
          } else if (status === "FAILED" || status === "EXPIRED") {
            clearInterval(pollInterval);
            throw new Error(`Generation Failed: ${statusData.task_error?.message || "Unknown error"}`);
          } else {
            updateImageState(index, {
              pipelineLog: [`Processing: ${status} (${statusData.progress}%)`]
            });
          }
        } catch (pollError) {
          clearInterval(pollInterval);
          updateImageState(index, { loading: false, pipelineStep: 'error', pipelineLog: ['Polling failed.'] });
        }
      }, 2000);

    } catch (error) {
      console.error("Generation Error:", error);
      updateImageState(index, { loading: false, pipelineStep: 'error', pipelineLog: ['Error during request.'] });
      alert("Failed to start generation.");
    }
  };

  // ---------------------------------------------------------------------------
  // 3. Post-Process: Capture & Render
  // ---------------------------------------------------------------------------
  const handleCaptureScreenshot = (index: number) => {
    const viewer = modelViewerRefs.current[index];
    if (!viewer) return;

    // Slight delay to ensure UI updates don't lag
    requestAnimationFrame(() => {
      const screenshot = viewer.captureScreenshot();
      if (screenshot) {
        updateImageState(index, {
          screenshotData: screenshot,
          pipelineLog: ['Screenshot captured. Ready to render.']
        });
        // Scroll to the new section
        setTimeout(() => {
          const element = document.getElementById(`screenshot-section-${index}`);
          if (element) element.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    });
  };

  const handlePhotorealisticRender = async (index: number) => {
    const image = images[index];
    if (!image || !image.screenshotData) return;

    updateImageState(index, { loading: true, pipelineStep: 'enhancing', pipelineLog: ['Rendering Photorealistic Image...'] });

    try {
      const response = await fetch("/api/enhance-render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: image.screenshotData })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Render failed");

      // Set the final result
      updateImageState(index, {
        finalRenderUrl: data.rendered_image,
        loading: false,
        pipelineStep: 'complete',
        pipelineLog: ['Render Complete!', ...(data.message ? [data.message] : [])]
      });

    } catch (error: any) {
      console.error("Render Error:", error);
      updateImageState(index, { loading: false, pipelineStep: 'error', pipelineLog: ['Render failed.'] });
      alert(`Render Error: ${error.message}`);
    }
  };

  return (
    <div className="uploader-wrapper">
      <div className="main-layout">
        <div className="uploader-container">

          {/* Drag & Drop Zone */}
          <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`} style={{
            border: '2px dashed #ccc',
            borderRadius: '10px',
            padding: '40px',
            textAlign: 'center',
            backgroundColor: isDragActive ? '#f0f8ff' : '#fafafa',
            cursor: 'pointer',
            marginBottom: '20px',
            transition: 'all 0.2s ease'
          }}>
            <input {...getInputProps()} />
            {isDragActive ? (
              <p style={{ fontSize: '1.2rem', color: '#0070f3' }}>Drop the floorplan here ...</p>
            ) : (
              <div>
                <p style={{ fontSize: '1.2rem', marginBottom: '10px' }}>Drag & drop floorplan here</p>
                <p style={{ color: '#888' }}>or click to select files</p>
              </div>
            )}
          </div>


          {images.length > 0 && (
            <div className="results-list">
              {images.map((img, index) => (
                <div key={index} className="result-row">

                  {/* Status Bar */}
                  <div style={{ width: '100%', marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>
                    <strong>Status:</strong> {img.pipelineStep.toUpperCase()}
                    {img.pipelineLog && img.pipelineLog.length > 0 && (
                      <span style={{ marginLeft: '10px', color: '#666', fontSize: '0.9em' }}>
                        - {img.pipelineLog[img.pipelineLog.length - 1]}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                    {/* STEP 1: Input & Enhancement */}
                    {!img.isHistoryItem && (
                      <div style={{ width: '100%' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#444', fontSize: '1.2rem' }}>
                          1. Floorplan Input
                        </div>

                        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                          {/* Image Previews Column */}
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>

                            {/* Original Image */}
                            <div style={{ position: 'relative', minHeight: '500px', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', overflow: 'hidden' }}>
                              <span style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,0.5)', color: 'white', padding: '4px 10px', borderRadius: '4px', fontSize: '0.8rem' }}>Original</span>
                              <img
                                src={img.url}
                                alt="Original Floorplan"
                                style={{ maxHeight: '500px', maxWidth: '100%', objectFit: 'contain' }}
                              />
                            </div>

                            {!img.result3d && !img.enhancedUrl && (
                              <div style={{ marginBottom: '20px', padding: '15px', background: '#f5f5f5', borderRadius: '8px' }}>
                                {(!img.selectedAction || img.selectedAction === 'enhance') && (
                                  <>
                                    <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Enhance Options</label>
                                    <input
                                      type="text"
                                      placeholder="Instructions (e.g. 'Remove furniture')"
                                      value={img.enhancementPrompt || ''}
                                      onChange={(e) => updateImageState(index, { enhancementPrompt: e.target.value })}
                                      style={{ width: '90%', marginBottom: '10px', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                                    />
                                    <button
                                      onClick={() => handleEnhanceImage(index)}
                                      disabled={img.loading}
                                      style={{ width: '100%', padding: '10px', background: '#333', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '10px' }}
                                    >
                                      {img.loading && img.pipelineStep === 'enhancing' ? (
                                        <>
                                          Enhancing...
                                        </>
                                      ) : (
                                        <>✨ Enhance Image</>
                                      )}
                                    </button>
                                  </>
                                )}

                                {(!img.selectedAction || img.selectedAction === '3d') && (
                                  <button
                                    onClick={() => callMeshyAPI(index, true)}
                                    disabled={img.loading}
                                    style={{
                                      width: '100%',
                                      padding: '12px',
                                      background: '#7928CA',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '6px',
                                      fontSize: '1rem',
                                      fontWeight: 'bold',
                                      cursor: img.loading ? 'wait' : 'pointer',
                                      opacity: img.loading ? 0.7 : 1
                                    }}
                                  >
                                    {img.loading ? 'Generating...' : (img.result3d ? 'Regenerate 3D' : 'Generate 3D Model')}
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Enhanced Image (Below) */}
                            {img.enhancedUrl && (
                              <>
                                <div style={{ position: 'relative', minHeight: '500px', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', overflow: 'hidden', border: '4px solid #0070f3' }}>
                                  <span style={{ position: 'absolute', top: 10, left: 10, background: '#0070f3', color: 'white', padding: '4px 10px', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.8rem' }}>Enhanced (AI)</span>
                                  <img
                                    src={img.enhancedUrl}
                                    alt="Enhanced Floorplan"
                                    style={{ maxHeight: '500px', maxWidth: '100%', objectFit: 'contain' }}
                                  />
                                </div>
                                <div style={{ background: '#f9f9f9', padding: '1rem', borderRadius: '8px', border: '1px solid #eee' }}>
                                  <div style={{ marginBottom: '0.5rem', fontWeight: 600 }}>3D Generation Settings</div>

                                  <div style={{ marginBottom: '10px' }}>
                                    <label style={{ fontSize: '0.9rem', display: 'block' }}>Quality:</label>
                                    <select
                                      disabled={img.loading}
                                      value={meshyPolycount}
                                      onChange={(e) => setMeshyPolycount(Number(e.target.value))}
                                      style={{ padding: '6px', width: '100%' }}
                                    >
                                      <option value={20000}>Low (20k)</option>
                                      <option value={30000}>Medium (30k)</option>
                                      <option value={50000}>High (50k)</option>
                                    </select>
                                  </div>
                                  {/* 
                              <button
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                style={{ fontSize: '0.8rem', background: 'none', border: 'none', color: '#0070f3', cursor: 'pointer', padding: 0, marginBottom: '10px' }}
                              >
                                {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
                              </button>

                              {showAdvanced && (
                                <div style={{ marginBottom: '10px', fontSize: '0.9rem' }}>
                                  <label style={{ display: 'block', marginBottom: '4px' }}>Symmetry:</label>
                                  <select
                                    disabled={img.loading}
                                    value={meshySymmetry}
                                    onChange={(e) => setMeshySymmetry(e.target.value)}
                                    style={{ width: '100%', padding: '4px' }}
                                  >
                                    <option value="off">OFF (Recommended)</option>
                                    <option value="auto">Auto</option>
                                    <option value="on">On</option>
                                  </select>
                                </div>

                              )} */}
                                  <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Model Options</label>
                                  <input
                                    type="text"
                                    placeholder="Prompts for 3D model render"
                                    value={img.modelPrompt || ''}
                                    onChange={(e) => updateImageState(index, { modelPrompt: e.target.value })}
                                    style={{ width: '90%', marginBottom: '10px', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                                  />

                                  <button
                                    onClick={() => callMeshyAPI(index)}
                                    disabled={img.loading}
                                    style={{
                                      width: '100%',
                                      padding: '12px',
                                      background: '#7928CA',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '6px',
                                      fontSize: '1rem',
                                      fontWeight: 'bold',
                                      cursor: img.loading ? 'wait' : 'pointer',
                                      opacity: img.loading ? 0.7 : 1
                                    }}
                                  >
                                    {img.loading ? 'Generating...' : (img.result3d ? 'Regenerate 3D' : 'Generate 3D Model')}
                                  </button>
                                </div>
                              </>
                            )}


                            {/* Controls Sidebar for Step 1 */}


                          </div>
                        </div>
                      </div>
                    )}

                    {/* STEP 2: 3D Viewer */}
                    {(img.enhancedUrl || img.selectedAction === '3d') && (
                      <div style={{ width: '100%' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#444', fontSize: '1.2rem' }}>2. 3D Model Interaction</div>

                        <div className="model-viewer-wrapper" style={{ aspectRatio: '4 / 3', background: '#e0e0e0', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
                          {img.result3d ? (
                            <>
                              <ModelViewer
                                ref={el => { modelViewerRefs.current[index] = el; }}
                                modelUrl={img.result3d}
                              />
                              <div style={{ position: 'absolute', bottom: '50px', right: '20px', zIndex: 10 }}>
                                <button
                                  onClick={() => handleCaptureScreenshot(index)}
                                  style={{
                                    padding: '12px 20px',
                                    background: 'rgba(0,0,0,0.8)',
                                    color: 'white',
                                    fontWeight: 'bold',
                                    fontSize: '1rem',
                                    border: '1px solid rgba(255,255,255,0.3)',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                                  }}
                                >
                                  📸 Take Screenshot for Render
                                </button>
                              </div>
                            </>
                          ) : (
                            <div style={{
                              height: '100%',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#888'
                            }}>
                              {img.loading && img.pipelineStep !== 'enhancing' ? (
                                <>
                                  <div className="spinner"></div>
                                  <p style={{ marginTop: '10px' }}>{img.pipelineLog?.[img.pipelineLog.length - 1] || 'Processing...'}</p>
                                </>
                              ) : (
                                <p>Generate 3D model to view here.</p>
                              )}
                            </div>
                          )}

                          {/* Capture Button */}

                        </div>
                      </div>
                    )}

                    {/* STEP 3: Captured View & Final Render */}
                    {img.screenshotData && (
                      <div id={`screenshot-section-${index}`} style={{ width: '100%', borderTop: '2px solid #eee', paddingTop: '20px' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '1rem', color: '#444', fontSize: '1.2rem' }}>3. Photorealistic Rendering</div>

                        <div style={{ display: 'flex', gap: '30px', alignItems: 'flex-start', justifyContent: 'center', flexDirection: 'column' }}>
                          {/* Captured Screenshot */}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#666', marginBottom: '10px' }}>Captured View</div>
                            <img src={img.screenshotData} style={{ width: '100%', maxHeight: '600px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #ddd', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} />

                            <div style={{ marginTop: '15px' }}>
                              <button
                                onClick={() => handlePhotorealisticRender(index)}
                                disabled={img.loading}
                                style={{
                                  width: '100%',
                                  padding: '15px',
                                  background: 'linear-gradient(135deg, #FFD700, #FDB931)',
                                  color: 'black',
                                  fontWeight: 'bold',
                                  fontSize: '1.1rem',
                                  border: 'none',
                                  borderRadius: '8px',
                                  cursor: img.loading ? 'wait' : 'pointer',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                                  boxShadow: '0 4px 12px rgba(255, 215, 0, 0.4)',
                                  transition: 'transform 0.1s'
                                }}
                              >
                                {img.loading && img.pipelineStep === 'enhancing' ? (
                                  <>
                                    <div className="spinner" style={{ width: '20px', height: '20px', borderTopColor: '#000', borderLeftColor: '#000' }}></div>
                                    Generating Render...
                                  </>
                                ) : (
                                  <>🎨 Generate Photorealistic Render</>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Final Render Result */}
                          {img.finalRenderUrl && (
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0070f3', marginBottom: '10px' }}>Final Result</div>
                              <a href={img.finalRenderUrl} download={`render-${Date.now()}.png`}>
                                <img src={img.finalRenderUrl} style={{ width: '100%', maxHeight: '600px', objectFit: 'contain', borderRadius: '8px', border: '4px solid #FFD700', cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }} title="Click to download" />
                              </a>
                              <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '0.9rem', color: '#888' }}>
                                Click image to download high-res version
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* History Sidebar */}
        <div className="history-sidebar">
          <div className="history-title">Recent 3D Designs</div>
          <div className="history-list">
            {loadingHistory && historyItems.length === 0 ? (
              <div className="history-empty">Loading...</div>
            ) : historyItems.length > 0 ? (
              historyItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="history-item-container"
                  onClick={() => loadFromHistory(item)}
                >
                  <div className="history-item" title={`Created: ${new Date(item.created_at).toLocaleString()}`}>
                    {item.thumbnail_url || item.image_url || item.texture_urls?.base_color ? (
                      <img src={item.thumbnail_url || item.image_url || item.texture_urls.base_color} alt="Thumbnail" />
                    ) : (
                      <div style={{ fontSize: '0.7rem', color: '#aaa' }}>3D</div>
                    )}
                    <div className={`status-indicator ${item.status === 'SUCCEEDED' ? 'complete' : ''}`}></div>
                  </div>
                  <div className="history-item-date">
                    {new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    <br />
                    {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))
            ) : (
              <div className="history-empty">No history found.</div>
            )}
          </div>
          <button
            onClick={fetchHistory}
            disabled={loadingHistory}
            style={{
              marginTop: '1rem',
              fontSize: '0.75rem',
              background: 'none',
              border: 'none',
              color: '#0070f3',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            Refresh History
          </button>
        </div>
      </div>
    </div >
  );
}


