interface ImagePreparationOptions {
  maxEdge?: number;
  jpegQuality?: number;
  preservePng?: boolean;
  maxLength?: number;
}

export const MAX_SINGLE_IMAGE_LENGTH = 3_200_000;
export const MAX_PAIRED_IMAGE_LENGTH = 1_400_000;

const loadImage = (source: string | File): Promise<{ image: HTMLImageElement; release: () => void }> =>
  new Promise((resolve, reject) => {
    const objectUrl = typeof source === 'string' ? source : URL.createObjectURL(source);
    const release = () => { if (typeof source !== 'string') URL.revokeObjectURL(objectUrl); };
    const image = new Image();
    image.onload = () => resolve({ image, release });
    image.onerror = () => {
      release();
      reject(new Error('The image could not be decoded.'));
    };
    image.src = objectUrl;
  });

const encode = (image: HTMLImageElement, maxEdge: number, type: string, quality?: number) => {
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas rendering is unavailable in this browser.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(type, quality);
};

export const prepareImage = async (source: string | File, options: ImagePreparationOptions = {}): Promise<string> => {
  const maxEdge = options.maxEdge ?? 2048;
  const jpegQuality = options.jpegQuality ?? 0.9;
  const maxLength = options.maxLength ?? MAX_SINGLE_IMAGE_LENGTH;
  const wantsPng = options.preservePng && (typeof source === 'string' ? source.startsWith('data:image/png') : source.type === 'image/png');
  const { image, release } = await loadImage(source);
  try {
    const attempts: Array<{ maxEdge: number; type: string; quality?: number }> = wantsPng
      ? [{ maxEdge, type: 'image/png' }, { maxEdge, type: 'image/jpeg', quality: 0.95 }]
      : [{ maxEdge, type: 'image/jpeg', quality: jpegQuality }];
    attempts.push(
      { maxEdge: Math.round(maxEdge * 0.75), type: 'image/jpeg', quality: 0.85 },
      { maxEdge: Math.round(maxEdge * 0.5), type: 'image/jpeg', quality: 0.8 },
      { maxEdge: Math.round(maxEdge * 0.35), type: 'image/jpeg', quality: 0.75 },
    );
    let encoded = '';
    for (const attempt of attempts) {
      encoded = encode(image, attempt.maxEdge, attempt.type, attempt.quality);
      if (encoded.length <= maxLength) return encoded;
    }
    return encoded;
  } finally {
    release();
  }
};

export const readJsonResponse = async (response: Response): Promise<any> => {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    if (response.status === 413) throw new Error('The image was too large for the server. Try a smaller image.');
    if (response.status === 504) throw new Error('The server timed out before the model responded. Try again.');
    throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 120)}`);
  }
};
