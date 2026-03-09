import React from 'react';
import type { PipelineStep } from './types';

interface GenerateSettingsProps {
  modelPrompt: string;
  polycount: number;
  loading: boolean;
  pipelineStep: PipelineStep;
  hasResult: boolean;
  onPolycountChange: (v: number) => void;
  onPromptChange: (v: string) => void;
  onGenerate: () => void;
}

export default function GenerateSettings({
  modelPrompt,
  polycount,
  loading,
  pipelineStep,
  hasResult,
  onPolycountChange,
  onPromptChange,
  onGenerate,
}: GenerateSettingsProps) {
  const isGenerating = loading && (pipelineStep === 'uploading' || pipelineStep === 'processing');

  return (
    <div style={{ background: '#f9f9f9', padding: '1rem', borderRadius: '8px', border: '1px solid #eee' }}>
      <div style={{ marginBottom: '0.5rem', fontWeight: 600 }}>Step 2 — Generate 3D Model</div>

      <div style={{ marginBottom: '10px' }}>
        <label style={{ fontSize: '0.9rem', display: 'block' }}>Quality:</label>
        <select
          disabled={loading}
          value={polycount}
          onChange={(e) => onPolycountChange(Number(e.target.value))}
          style={{ padding: '6px', width: '100%' }}
        >
          <option value={20000}>Low (20k)</option>
          <option value={30000}>Medium (30k)</option>
          <option value={50000}>High (50k)</option>
        </select>
      </div>

      <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Additional Prompt</label>
      <input
        type="text"
        placeholder="e.g. 'modern kitchen, marble countertops'"
        value={modelPrompt}
        onChange={(e) => onPromptChange(e.target.value)}
        style={{
          width: '90%', marginBottom: '10px', padding: '8px',
          borderRadius: '4px', border: '1px solid #ddd',
        }}
      />

      <button
        onClick={onGenerate}
        disabled={loading}
        style={{
          width: '100%',
          padding: '12px',
          background: '#7928CA',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          fontSize: '1rem',
          fontWeight: 'bold',
          cursor: loading ? 'wait' : 'pointer',
          opacity: loading ? 0.7 : 1,
        }}
      >
        {isGenerating ? 'Generating...' : hasResult ? 'Regenerate 3D' : 'Generate 3D Model'}
      </button>
    </div>
  );
}
