const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

export const downscaleImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Canvas rendering is unavailable in this browser.'));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('The image could not be decoded.'));
    };
    image.src = objectUrl;
  });

export const readJsonResponse = async (response: Response): Promise<any> => {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    if (response.status === 413) throw new Error('The photo was too large for the server. Try a smaller image.');
    throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 120)}`);
  }
};
