import React from 'react';
import type { PipelineStep } from './types';

interface RenderSectionProps {
  screenshotData: string;
  loading: boolean;
  pipelineStep: PipelineStep;
  finalRenderUrl?: string;
  onRender: () => void;
  sectionId: string;
}

export default function RenderSection({
  screenshotData,
  loading,
  pipelineStep,
  finalRenderUrl,
  onRender,
  sectionId,
}: RenderSectionProps) {
  const isRendering = loading && pipelineStep === 'enhancing';

  return (
    <div
      id={sectionId}
      style={{ width: '100%', borderTop: '2px solid #eee', paddingTop: '20px' }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: '1rem', color: '#444', fontSize: '1.2rem' }}>
        3. Photorealistic Rendering
      </div>

      <div style={{ display: 'flex', gap: '30px', alignItems: 'flex-start', flexDirection: 'column' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#666', marginBottom: '10px' }}>
            Captured View
          </div>
          <img
            src={screenshotData}
            style={{
              width: '100%', maxHeight: '600px', objectFit: 'contain',
              borderRadius: '8px', border: '1px solid #ddd',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            }}
          />

          <div style={{ marginTop: '15px' }}>
            <button
              onClick={onRender}
              disabled={loading}
              style={{
                width: '100%',
                padding: '15px',
                background: 'linear-gradient(135deg, #FFD700, #FDB931)',
                color: 'black',
                fontWeight: 'bold',
                fontSize: '1.1rem',
                border: 'none',
                borderRadius: '8px',
                cursor: loading ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                boxShadow: '0 4px 12px rgba(255, 215, 0, 0.4)',
                transition: 'transform 0.1s',
              }}
            >
              {isRendering ? (
                <>
                  <div className="spinner" style={{ width: '20px', height: '20px', borderTopColor: '#000', borderLeftColor: '#000' }} />
                  Generating Render...
                </>
              ) : (
                <>🎨 Generate Photorealistic Render</>
              )}
            </button>
          </div>
        </div>

        {finalRenderUrl && (
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0070f3', marginBottom: '10px' }}>
              Final Result
            </div>
            <a href={finalRenderUrl} download={`render-${Date.now()}.png`}>
              <img
                src={finalRenderUrl}
                style={{
                  width: '100%', maxHeight: '600px', objectFit: 'contain',
                  borderRadius: '8px', border: '4px solid #FFD700',
                  cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                }}
                title="Click to download"
              />
            </a>
            <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '0.9rem', color: '#888' }}>
              Click image to download high-res version
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
