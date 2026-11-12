import heic2any from 'heic2any';
import type { ConversionSettings } from './types';

/**
 * Normalises an input file to a standard CanvasImageSource.
 * Decodes Apple HEIC/HEIF files on the client side into standard PNG Blobs first.
 */
export const prepareImageSource = async (file: File): Promise<Blob> => {
  const isHeic = file.type === 'image/heic' || 
                 file.type === 'image/heif' || 
                 file.name.toLowerCase().endsWith('.heic') || 
                 file.name.toLowerCase().endsWith('.heif');

  if (isHeic) {
    // Decodes HEIC to standard PNG blob in browser
    const conversionResult = await heic2any({
      blob: file,
      toType: 'image/png',
      quality: 1,
    });
    return Array.isArray(conversionResult) ? conversionResult[0] : conversionResult;
  }

  return file;
};

/**
 * Core transformation pipeline using HTML5 Canvas
 * Handles resizing, transparency preservation, and background fill options.
 */
export const convertImageBlob = async (
  sourceBlob: Blob,
  settings: ConversionSettings
): Promise<{ blob: Blob; dimensions: { width: number; height: number } }> => {
  const imageBitmap = await createImageBitmap(sourceBlob);
  let { width, height } = imageBitmap;

  // Calculate proportional constrained dimensions if max limits are configured
  if (settings.maxWidth && width > settings.maxWidth) {
    height = Math.round((height * settings.maxWidth) / width);
    width = settings.maxWidth;
  }
  if (settings.maxHeight && height > settings.maxHeight) {
    width = Math.round((width * settings.maxHeight) / height);
    height = settings.maxHeight;
  }

  // Create canvas for rendering
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: true });

  if (!ctx) {
    throw new Error('Could not initialize Canvas 2D rendering context');
  }

  // Handle transparency vs matte fill
  const isTargetJpeg = settings.targetFormat === 'image/jpeg';
  if (isTargetJpeg || !settings.preserveAlpha) {
    // Fill canvas background matte color (default clean white if converting to JPEG)
    ctx.fillStyle = settings.matteColor === 'transparent' ? '#ffffff' : settings.matteColor;
    ctx.fillRect(0, 0, width, height);
  } else {
    // Retain clean transparent alpha
    ctx.clearRect(0, 0, width, height);
  }

  // Render high-quality scaled graphic
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(imageBitmap, 0, 0, width, height);

  // Encode to target format Blob
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

/**
 * Calculates user-friendly file size strings (e.g. 1.45 MB)
 */
export const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

/**
 * Returns clean file extension based on MIME type
 */
export const getExtensionForFormat = (format: ConversionSettings['targetFormat']): string => {
  switch (format) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/webp': return 'webp';
  }
};
