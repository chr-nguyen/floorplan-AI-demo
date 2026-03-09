export type PipelineStep = 'idle' | 'uploading' | 'enhancing' | 'processing' | 'complete' | 'error';

export interface ImageItem {
  url: string;
  originalFile: File;
  isometricUrl?: string;
  modelPrompt?: string;
  screenshotData?: string;
  finalRenderUrl?: string;
  loading: boolean;
  result3d?: string;
  pipelineStep: PipelineStep;
  pipelineLog?: string[];
  meshyTaskId?: string;
  isHistoryItem?: boolean;
}
