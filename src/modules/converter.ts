import heic2any from 'heic2any';
import UTIF from 'utif';
import { GifReader } from 'omggif';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import type { ConversionSettings } from './types';

/**
 * Decodes an incoming GIF buffer with full transparency index preservation.
 */
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

/**
 * Normalises an input file to a standard Blob.
 * Handles Apple HEIC/HEIF, TIFF, and GIF.
 */
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
 * Core transformation pipeline using HTML5 Canvas & gifenc
 */
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

  // Pre-fill background if flattening alpha for non-knockout JPEG
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

  // Chroma-Key Background Eraser Pass
  if (settings.removeBackground) {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    let targetR = data[0];
    let targetG = data[1];
    let targetB = data[2];

    if (settings.bgTargetColor && settings.bgTargetColor !== 'auto') {
      const hex = settings.bgTargetColor.replace('#', '');
      targetR = parseInt(hex.substring(0, 2), 16);
      targetG = parseInt(hex.substring(2, 4), 16);
      targetB = parseInt(hex.substring(4, 6), 16);
    }

    // Map 0-100 tolerance to Euclidean color distance (max 441.67)
    const tolerance = settings.bgTolerance * 4.41;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const distance = Math.sqrt(
        (r - targetR) ** 2 +
        (g - targetG) ** 2 +
        (b - targetB) ** 2
      );

      if (distance <= tolerance) {
        data[i + 3] = 0; // Transparent
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
