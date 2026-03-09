import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import type { ModelViewerRef } from './ModelViewer';
import IsometricStep from './IsometricStep';
import GenerateSettings from './GenerateSettings';
import ModelViewerSection from './ModelViewerSection';
import RenderSection from './RenderSection';
import HistorySidebar from './HistorySidebar';
import type { ImageItem } from './types';
import './ImageUploader.css';

export default function ImageUploader() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [meshyPolycount, setMeshyPolycount] = useState<number>(30000);

  const modelViewerRefs = useRef<(ModelViewerRef | null)[]>([]);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const updateImageState = (index: number, updates: Partial<ImageItem>) => {
    setImages(prev => prev.map((img, i) => i === index ? { ...img, ...updates } : img));
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
    });

  const urlToBase64 = async (url: string): Promise<string> => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
    });
  };

  // ---------------------------------------------------------------------------
  // Drag & Drop
  // ---------------------------------------------------------------------------
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles?.length > 0) {
      const newImages = acceptedFiles.map((file) => ({
        url: URL.createObjectURL(file),
        originalFile: file,
        loading: false,
        pipelineStep: 'idle' as const,
        pipelineLog: [],
      }));
      setImages(newImages.slice(0, 1));
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png'] },
  });

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------
  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const response = await fetch('/api/meshy');
      if (response.ok) {
        const data = await response.json();
        setHistoryItems(data.slice(0, 10));
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const loadFromHistory = (item: any) => {
    const modelUrl = item.model_urls?.glb;
    if (!modelUrl) return;

    const newItem: ImageItem = {
      url: item.thumbnail_url || item.image_url || item.texture_urls?.base_color || '',
      originalFile: new File([], 'history-item'),
      result3d: `/api/proxy-model?url=${encodeURIComponent(modelUrl)}`,
      pipelineStep: 'complete',
      pipelineLog: ['Loaded from history'],
      loading: false,
      isHistoryItem: true,
    };

    setImages([newItem]);
    setTimeout(() => {
      window.scrollTo({
        top: (document.querySelector('.results-list')?.getBoundingClientRect().top ?? 0) + window.scrollY,
        behavior: 'smooth',
      });
    }, 100);
  };

  // ---------------------------------------------------------------------------
  // Step 1: Isometric Conversion
  // ---------------------------------------------------------------------------
  const handleIsometricConvert = async (index: number) => {
    const image = images[index];
    if (!image) return;

    updateImageState(index, { loading: true, pipelineStep: 'enhancing', pipelineLog: ['Converting to isometric view...'] });

    try {
      const sourceImage = await fileToBase64(image.originalFile);
      const response = await fetch('/api/isometric-view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: sourceImage }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Isometric conversion failed');

      const blob = await (await fetch(data.isometric_image)).blob();
      const isometricUrl = URL.createObjectURL(blob);

      updateImageState(index, {
        loading: false,
        isometricUrl,
        pipelineStep: 'idle',
        pipelineLog: ['Isometric view ready!', ...(data.note ? [data.note] : [])],
      });
    } catch (error: any) {
      console.error('Isometric Error:', error);
      updateImageState(index, { loading: false, pipelineStep: 'error', pipelineLog: ['Isometric conversion failed.'] });
      alert(`Isometric Error: ${error.message}`);
    }
  };

  // ---------------------------------------------------------------------------
  // Step 2: 3D Generation via Meshy
  // ---------------------------------------------------------------------------
  const callMeshyAPI = async (index: number) => {
    const image = images[index];
    if (!image) return;

    updateImageState(index, { loading: true, pipelineStep: 'uploading', result3d: undefined, pipelineLog: ['Preparing upload...'] });

    try {
      const base64Image = image.isometricUrl
        ? await urlToBase64(image.isometricUrl)
        : await fileToBase64(image.originalFile);

      updateImageState(index, { pipelineStep: 'processing', pipelineLog: ['Sending to 3D service...'] });

      const payload = {
        image_url: base64Image,
        ai_model: 'latest',
        enable_pbr: true,
        topology: 'quad',
        target_polycount: meshyPolycount,
        symmetry_mode: 'off',
        should_remesh: false,
        image_enhancement: false,
        prompt: 'Architectural floor plan, extruded walls with door and window openings, white matte walls, concrete floor, open ceiling, no roof, clean geometric hard surface, top-down orthographic view, no furniture'
          + (image.modelPrompt ? `, ${image.modelPrompt}` : ''),
        texture_prompt: 'Realistic interior materials: smooth white walls, polished concrete floor, natural wood accents, high quality architectural finishes.',
      };

      const response = await fetch('/api/meshy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(`3D API Error (${response.status}): ${await response.text()}`);

      const data = await response.json();
      const taskId = data.result;
      if (!taskId) throw new Error('No Task ID returned');

      updateImageState(index, { meshyTaskId: taskId, pipelineLog: ['Task queued. Polling status...'] });

      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/meshy?taskId=${taskId}`);
          if (!statusRes.ok) return;

          const statusData = await statusRes.json();
          const status = statusData.status;
          console.log(`Polling Task ${taskId}: ${status} (${statusData.progress}%)`);

          if (status === 'SUCCEEDED') {
            clearInterval(pollInterval);
            const modelUrl = statusData.model_urls?.glb;
            if (!modelUrl) throw new Error('Generation succeeded but no model found.');
            updateImageState(index, {
              loading: false,
              result3d: `/api/proxy-model?url=${encodeURIComponent(modelUrl)}`,
              pipelineStep: 'complete',
              pipelineLog: ['Generation Complete!'],
            });
          } else if (status === 'FAILED' || status === 'EXPIRED') {
            clearInterval(pollInterval);
            throw new Error(`Generation Failed: ${statusData.task_error?.message || 'Unknown error'}`);
          } else {
            updateImageState(index, { pipelineLog: [`Processing: ${status} (${statusData.progress}%)`] });
          }
        } catch (pollError) {
          clearInterval(pollInterval);
          updateImageState(index, { loading: false, pipelineStep: 'error', pipelineLog: ['Polling failed.'] });
        }
      }, 2000);

    } catch (error) {
      console.error('Generation Error:', error);
      updateImageState(index, { loading: false, pipelineStep: 'error', pipelineLog: ['Error during request.'] });
      alert('Failed to start generation.');
    }
  };

  // ---------------------------------------------------------------------------
  // Step 3: Screenshot & Photorealistic Render
  // ---------------------------------------------------------------------------
  const handleCaptureScreenshot = (index: number) => {
    const viewer = modelViewerRefs.current[index];
    if (!viewer) return;

    requestAnimationFrame(() => {
      const screenshot = viewer.captureScreenshot();
      if (screenshot) {
        updateImageState(index, { screenshotData: screenshot, pipelineLog: ['Screenshot captured. Ready to render.'] });
        setTimeout(() => {
          document.getElementById(`screenshot-section-${index}`)?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    });
  };

  const handlePhotorealisticRender = async (index: number) => {
    const image = images[index];
    if (!image?.screenshotData) return;

    updateImageState(index, { loading: true, pipelineStep: 'enhancing', pipelineLog: ['Rendering Photorealistic Image...'] });

    try {
      const response = await fetch('/api/enhance-render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: image.screenshotData }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Render failed');

      updateImageState(index, {
        finalRenderUrl: data.rendered_image,
        loading: false,
        pipelineStep: 'complete',
        pipelineLog: ['Render Complete!', ...(data.message ? [data.message] : [])],
      });
    } catch (error: any) {
      console.error('Render Error:', error);
      updateImageState(index, { loading: false, pipelineStep: 'error', pipelineLog: ['Render failed.'] });
      alert(`Render Error: ${error.message}`);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="uploader-wrapper">
      <div className="main-layout">
        <div className="uploader-container">

          {/* Drag & Drop Zone */}
          <div
            {...getRootProps()}
            className={`dropzone ${isDragActive ? 'active' : ''}`}
            style={{
              border: '2px dashed #ccc',
              borderRadius: '10px',
              padding: '40px',
              textAlign: 'center',
              backgroundColor: isDragActive ? '#f0f8ff' : '#fafafa',
              cursor: 'pointer',
              marginBottom: '20px',
              transition: 'all 0.2s ease',
            }}
          >
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

                    {/* Step 1: Floorplan Input */}
                    {!img.isHistoryItem && (
                      <div style={{ width: '100%' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#444', fontSize: '1.2rem' }}>
                          1. Floorplan Input
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          {/* Original image */}
                          <div style={{
                            position: 'relative', minHeight: '500px', background: '#f0f0f0',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            borderRadius: '8px', overflow: 'hidden',
                          }}>
                            <span style={{
                              position: 'absolute', top: 10, left: 10,
                              background: 'rgba(0,0,0,0.5)', color: 'white',
                              padding: '4px 10px', borderRadius: '4px', fontSize: '0.8rem',
                            }}>
                              Original
                            </span>
                            <img
                              src={img.url}
                              alt="Original Floorplan"
                              style={{ maxHeight: '500px', maxWidth: '100%', objectFit: 'contain' }}
                            />
                          </div>

                          <IsometricStep
                            isometricUrl={img.isometricUrl}
                            loading={img.loading}
                            pipelineStep={img.pipelineStep}
                            onConvert={() => handleIsometricConvert(index)}
                          />

                          <GenerateSettings
                            modelPrompt={img.modelPrompt || ''}
                            polycount={meshyPolycount}
                            loading={img.loading}
                            pipelineStep={img.pipelineStep}
                            hasResult={!!img.result3d}
                            onPolycountChange={setMeshyPolycount}
                            onPromptChange={(v) => updateImageState(index, { modelPrompt: v })}
                            onGenerate={() => callMeshyAPI(index)}
                          />
                        </div>
                      </div>
                    )}

                    {/* Step 2: 3D Viewer */}
                    {(img.result3d || (img.loading && img.pipelineStep !== 'enhancing') || img.isHistoryItem) && (
                      <ModelViewerSection
                        result3d={img.result3d}
                        loading={img.loading}
                        pipelineStep={img.pipelineStep}
                        pipelineLog={img.pipelineLog}
                        onScreenshot={() => handleCaptureScreenshot(index)}
                        viewerRef={(el) => { modelViewerRefs.current[index] = el; }}
                      />
                    )}

                    {/* Step 3: Photorealistic Render */}
                    {img.screenshotData && (
                      <RenderSection
                        screenshotData={img.screenshotData}
                        loading={img.loading}
                        pipelineStep={img.pipelineStep}
                        finalRenderUrl={img.finalRenderUrl}
                        onRender={() => handlePhotorealisticRender(index)}
                        sectionId={`screenshot-section-${index}`}
                      />
                    )}

                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <HistorySidebar
          historyItems={historyItems}
          loadingHistory={loadingHistory}
          onLoadItem={loadFromHistory}
          onRefresh={fetchHistory}
        />
      </div>
    </div>
  );
}
