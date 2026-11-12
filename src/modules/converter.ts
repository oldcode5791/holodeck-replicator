import heic2any from 'heic2any';
import UTIF from 'utif';
import { GifReader } from 'omggif';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import type { ConversionSettings } from './types';

const decodeGifToBlob = async (buffer: ArrayBuffer): Promise<Blob> => {
  const bytes = new Uint8Array(buffer);
  const reader = new GifReader(bytes);
  const width = reader.width;
  const height = reader.height;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('Could not initialise Canvas context for GIF parsing.');

  const imgData = ctx.createImageData(width, height);
  reader.decodeAndBlitFrameRGBA(0, imgData.data);
  ctx.putImageData(imgData, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode rasterised GIF frame.'));
    }, 'image/png');
  });
};

export const prepareImageSource = async (file: File): Promise<Blob> => {
  const fileName = file.name.toLowerCase();

  const isHeic = file.type === 'image/heic' || 
                 file.type === 'image/heif' || 
                 fileName.endsWith('.heic') || 
                 fileName.endsWith('.heif');

  if (isHeic) {
    const conversionResult = await heic2any({
      blob: file,
      toType: 'image/png',
      quality: 1,
    });
    return Array.isArray(conversionResult) ? conversionResult[0] : conversionResult;
  }

  const isTiff = file.type === 'image/tiff' || 
                 fileName.endsWith('.tiff') || 
                 fileName.endsWith('.tif');

  if (isTiff) {
    const buffer = await file.arrayBuffer();
    const ifds = UTIF.decode(buffer);
    if (!ifds || ifds.length === 0) {
      throw new Error('Unable to parse TIFF directory metadata.');
    }

    const firstPage = ifds[0];
    UTIF.decodeImage(buffer, firstPage);
    const rgba = UTIF.toRGBA8(firstPage);

    const canvas = document.createElement('canvas');
    canvas.width = firstPage.width;
    canvas.height = firstPage.height;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Could not create Canvas context for TIFF decoding.');

    const imgData = ctx.createImageData(firstPage.width, firstPage.height);
    imgData.data.set(rgba);
    ctx.putImageData(imgData, 0, 0);

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to encode rasterised TIFF to PNG blob.'));
      }, 'image/png');
    });
  }

  const isGif = file.type === 'image/gif' || fileName.endsWith('.gif');
  if (isGif) {
    const buffer = await file.arrayBuffer();
    return await decodeGifToBlob(buffer);
  }

  return file;
};

/**
 * Flood-fill (Magic Wand) erasure starting from a seed pixel (startX, startY)
 */
const floodFillErase = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  targetR: number,
  targetG: number,
  targetB: number,
  tolerance: number
) => {
  const visited = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  let ptr = 0;

  const push = (x: number, y: number) => {
    const idx = y * width + x;
    if (visited[idx]) return;
    visited[idx] = 1;
    stack[ptr++] = idx;
  };

  push(startX, startY);

  while (ptr > 0) {
    const idx = stack[--ptr];
    const p = idx * 4;

    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];

    const dist = Math.sqrt(
      (r - targetR) ** 2 +
      (g - targetG) ** 2 +
      (b - targetB) ** 2
    );

    if (dist <= tolerance) {
      data[p + 3] = 0; // Wipe pixel alpha to 0

      const x = idx % width;
      const y = (idx - x) / width;

      if (x > 0) push(x - 1, y);
      if (x < width - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y < height - 1) push(x, y + 1);
    }
  }
};

export const convertImageBlob = async (
  sourceBlob: Blob,
  settings: ConversionSettings
): Promise<{ blob: Blob; dimensions: { width: number; height: number } }> => {
  const imageBitmap = await createImageBitmap(sourceBlob);
  let { width, height } = imageBitmap;

  if (settings.maxWidth && width > settings.maxWidth) {
    height = Math.round((height * settings.maxWidth) / width);
    width = settings.maxWidth;
  }
  if (settings.maxHeight && height > settings.maxHeight) {
    width = Math.round((width * settings.maxHeight) / height);
    height = settings.maxHeight;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: true });

  if (!ctx) {
    throw new Error('Could not initialise Canvas 2D rendering context');
  }

  const isTargetJpeg = settings.targetFormat === 'image/jpeg';
  if ((isTargetJpeg || !settings.preserveAlpha) && !settings.removeBackground) {
    ctx.fillStyle = settings.matteColor === 'transparent' ? '#ffffff' : settings.matteColor;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(imageBitmap, 0, 0, width, height);

  // Chroma-Key / Eyedropper Background Eraser Pass
  if (settings.removeBackground) {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // Determine seed coordinates (eyedropper click or top-left 0,0)
    const seedX = settings.samplePoint
      ? Math.min(width - 1, Math.max(0, Math.round(settings.samplePoint.x * width)))
      : 0;
    const seedY = settings.samplePoint
      ? Math.min(height - 1, Math.max(0, Math.round(settings.samplePoint.y * height)))
      : 0;
    const seedOffset = (seedY * width + seedX) * 4;

    let targetR = data[seedOffset];
    let targetG = data[seedOffset + 1];
    let targetB = data[seedOffset + 2];

    if (settings.bgTargetColor && settings.bgTargetColor !== 'auto') {
      const hex = settings.bgTargetColor.replace('#', '');
      targetR = parseInt(hex.substring(0, 2), 16);
      targetG = parseInt(hex.substring(2, 4), 16);
      targetB = parseInt(hex.substring(4, 6), 16);
    }

    const tolerance = settings.bgTolerance * 4.41;

    if (settings.bgContiguous) {
      // Magic Wand contiguous flood-fill from seed pixel
      floodFillErase(data, width, height, seedX, seedY, targetR, targetG, targetB, tolerance);
    } else {
      // Global colour wipe across entire canvas
      for (let i = 0; i < data.length; i += 4) {
        const distance = Math.sqrt(
          (data[i] - targetR) ** 2 +
          (data[i + 1] - targetG) ** 2 +
          (data[i + 2] - targetB) ** 2
        );
        if (distance <= tolerance) {
          data[i + 3] = 0;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }

  // Export to GIF via gifenc
  if (settings.targetFormat === 'image/gif') {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    const preserveAlpha = settings.preserveAlpha || settings.removeBackground;
    const format = preserveAlpha ? 'rgba4444' : 'rgb565';
    const palette = quantize(data, 256, {
      format,
      oneBitAlpha: true,
    });

    const index = applyPalette(data, palette, format);

    let transparentIndex = -1;
    if (preserveAlpha) {
      transparentIndex = palette.findIndex((rgba: number[]) => rgba[3] === 0);
    }

    const gif = GIFEncoder();
    gif.writeFrame(index, width, height, {
      palette,
      transparent: transparentIndex !== -1,
      transparentIndex: transparentIndex !== -1 ? transparentIndex : 0,
    });
    gif.finish();

    const gifBlob = new Blob([gif.bytes()], { type: 'image/gif' });
    return { blob: gifBlob, dimensions: { width, height } };
  }

  // Export to WebP, PNG, or JPEG
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (resultBlob) => {
        if (!resultBlob) {
          reject(new Error('Failed to encode image from canvas'));
          return;
        }
        resolve({ blob: resultBlob, dimensions: { width, height } });
      },
      settings.targetFormat,
      settings.quality
    );
  });
};

export const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

export const getExtensionForFormat = (format: ConversionSettings['targetFormat']): string => {
  switch (format) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/webp': return 'webp';
    case 'image/gif': return 'gif';
  }
};
