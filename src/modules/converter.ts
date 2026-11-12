import heic2any from 'heic2any';
import UTIF from 'utif';
import { GifReader } from 'omggif';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import type { ConversionSettings } from './types';

/**
 * Decodes a GIF buffer with full transparency index preservation.
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
 * Normalises an input file to a standard CanvasImageSource.
 * Decodes Apple HEIC/HEIF, TIFF, and GIF files on the client side into standard PNG Blobs.
 */
export const prepareImageSource = async (file: File): Promise<Blob> => {
  const fileName = file.name.toLowerCase();

  // 1. HEIC / HEIF handling
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

  // 2. TIFF handling via UTIF
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

  // 3. GIF handling via omggif
  const isGif = file.type === 'image/gif' || fileName.endsWith('.gif');
  if (isGif) {
    const buffer = await file.arrayBuffer();
    return await decodeGifToBlob(buffer);
  }

  // Standard web formats (JPEG, PNG, WebP)
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

  const isTargetJpeg = settings.targetFormat === 'image/jpeg';
  if (isTargetJpeg || !settings.preserveAlpha) {
    ctx.fillStyle = settings.matteColor === 'transparent' ? '#ffffff' : settings.matteColor;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(imageBitmap, 0, 0, width, height);

  // Custom client-side GIF export via gifenc
  if (settings.targetFormat === 'image/gif') {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    const format = settings.preserveAlpha ? 'rgba4444' : 'rgb565';
    const palette = quantize(data, 256, {
      format,
      oneBitAlpha: true,
    });

    const index = applyPalette(data, palette, format);

    let transparentIndex = -1;
    if (settings.preserveAlpha) {
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

  // Standard browser-supported formats (WebP, PNG, JPEG)
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
