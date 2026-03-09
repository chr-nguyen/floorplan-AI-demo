import React from 'react';
import ModelViewer, { type ModelViewerRef } from './ModelViewer';
import type { PipelineStep } from './types';

interface ModelViewerSectionProps {
  result3d?: string;
  loading: boolean;
  pipelineStep: PipelineStep;
  pipelineLog?: string[];
  onScreenshot: () => void;
  viewerRef: React.Ref<ModelViewerRef>;
}

export default function ModelViewerSection({
  result3d,
  loading,
  pipelineStep,
  pipelineLog,
  onScreenshot,
  viewerRef,
}: ModelViewerSectionProps) {
  return (
    <div style={{ width: '100%' }}>
      <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#444', fontSize: '1.2rem' }}>
        2. 3D Model Interaction
      </div>

      <div
        className="model-viewer-wrapper"
        style={{ aspectRatio: '4 / 3', background: '#e0e0e0', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}
      >
        {result3d ? (
          <>
            <ModelViewer ref={viewerRef} modelUrl={result3d} />
            <div style={{ position: 'absolute', bottom: '50px', right: '20px', zIndex: 10 }}>
              <button
                onClick={onScreenshot}
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
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
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
            color: '#888',
          }}>
            {loading && pipelineStep !== 'enhancing' ? (
              <>
                <div className="spinner" />
                <p style={{ marginTop: '10px' }}>
                  {pipelineLog?.[pipelineLog.length - 1] || 'Processing...'}
                </p>
              </>
            ) : (
              <p>Generate 3D model to view here.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
