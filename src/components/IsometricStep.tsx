import React from 'react';
import type { PipelineStep } from './types';

interface IsometricStepProps {
  isometricUrl?: string;
  loading: boolean;
  pipelineStep: PipelineStep;
  onConvert: () => void;
}

export default function IsometricStep({ isometricUrl, loading, pipelineStep, onConvert }: IsometricStepProps) {
  const isConverting = loading && pipelineStep === 'enhancing';

  return (
    <>
      <div style={{ background: '#f0f4ff', padding: '1rem', borderRadius: '8px', border: '1px solid #c7d7ff' }}>
        <div style={{ marginBottom: '0.5rem', fontWeight: 600, color: '#2c4ecf' }}>
          Step 1 — Convert to Isometric View
        </div>
        <p style={{ fontSize: '0.85rem', color: '#555', margin: '0 0 0.75rem 0' }}>
          Generates a perspective view with full 10ft walls, 2ft of solid wall above every door and window.
          Gives Meshy elevation data for accurate wall height.
        </p>
        <button
          onClick={onConvert}
          disabled={loading}
          style={{
            width: '100%',
            padding: '10px',
            background: isometricUrl ? '#e8f0fe' : '#2c4ecf',
            color: isometricUrl ? '#2c4ecf' : 'white',
            border: isometricUrl ? '2px solid #2c4ecf' : 'none',
            borderRadius: '6px',
            fontWeight: 'bold',
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {isConverting
            ? 'Converting...'
            : isometricUrl
            ? 'Re-convert to Isometric'
            : 'Convert to Isometric View'}
        </button>
      </div>

      {isometricUrl && (
        <div style={{
          position: 'relative',
          minHeight: '500px',
          background: '#f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '8px',
          overflow: 'hidden',
          border: '4px solid #2c4ecf',
        }}>
          <span style={{
            position: 'absolute', top: 10, left: 10,
            background: '#2c4ecf', color: 'white',
            padding: '4px 10px', borderRadius: '4px',
            fontWeight: 'bold', fontSize: '0.8rem',
          }}>
            Isometric View (AI)
          </span>
          <img
            src={isometricUrl}
            alt="Isometric View"
            style={{ maxHeight: '500px', maxWidth: '100%', objectFit: 'contain' }}
          />
        </div>
      )}
    </>
  );
}
