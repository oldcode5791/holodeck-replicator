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

const hexToRgb = (hex: string): [number, number, number] => {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.substring(0, 2), 16),
    parseInt(clean.substring(2, 4), 16),
    parseInt(clean.substring(4, 6), 16),
  ];
};

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

    if (data[p + 3] === 0) continue; // Already transparent

    const dist = Math.sqrt(
      (data[p] - targetR) ** 2 +
      (data[p + 1] - targetG) ** 2 +
      (data[p + 2] - targetB) ** 2
    );

    if (dist <= tolerance) {
      data[p + 3] = 0;

      const x = idx % width;
      const y = (idx - x) / width;

      if (x > 0) push(x - 1, y);
      if (x < width - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y < height - 1) push(x, y + 1);
    }
  }
};

const globalColorErase = (
  data: Uint8ClampedArray,
  targetR: number,
  targetG: number,
  targetB: number,
  tolerance: number
) => {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const distance = Math.sqrt(
      (data[i] - targetR) ** 2 +
      (data[i + 1] - targetG) ** 2 +
      (data[i + 2] - targetB) ** 2
    );
    if (distance <= tolerance) {
      data[i + 3] = 0;
    }
  }
};

/**
 * Shared knockout pass used by both the batch encoder and the live Eyedropper preview
 */
export const applyBackgroundKnockout = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  settings: ConversionSettings
) => {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const tolerance = settings.bgTolerance * 4.41;

  // If user clicked one or more points with the eyedropper, process every point
  if (settings.samplePoints && settings.samplePoints.length > 0) {
    for (const pt of settings.samplePoints) {
      const seedX = Math.min(width - 1, Math.max(0, Math.round(pt.x * width)));
      const seedY = Math.min(height - 1, Math.max(0, Math.round(pt.y * height)));
      const [r, g, b] = hexToRgb(pt.color);

      if (settings.bgContiguous) {
        floodFillErase(data, width, height, seedX, seedY, r, g, b, tolerance);
      } else {
        globalColorErase(data, r, g, b, tolerance);
      }
    }
  } else {
    // Fallback to single auto/preset colour from (0,0)
    let targetR = data[0];
    let targetG = data[1];
    let targetB = data[2];

    if (settings.bgTargetColor && settings.bgTargetColor !== 'auto') {
      [targetR, targetG, targetB] = hexToRgb(settings.bgTargetColor);
    }

    if (settings.bgContiguous) {
      floodFillErase(data, width, height, 0, 0, targetR, targetG, targetB, tolerance);
    } else {
      globalColorErase(data, targetR, targetG, targetB, tolerance);
    }
  }

  ctx.putImageData(imgData, 0, 0);
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

  if (settings.removeBackground) {
    applyBackgroundKnockout(ctx, width, height, settings);
  }

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
