import heic2any from 'heic2any';
import UTIF from 'utif';
import { GifReader } from 'omggif';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import type { ConversionSettings } from './types';

export interface DecodedFrame {
  canvas: HTMLCanvasElement;
  delay: number; // centiseconds (1/100s) for GIF encoder
}

export interface PreparedSource {
  frames: DecodedFrame[];
  isAnimated: boolean;
}

/**
 * Decodes all frames of a static or animated GIF with full disposal & transparency handling.
 */
const decodeGifFrames = async (buffer: ArrayBuffer): Promise<PreparedSource> => {
  const bytes = new Uint8Array(buffer);
  const reader = new GifReader(bytes);
  const width = reader.width;
  const height = reader.height;
  const numFrames = reader.numFrames();

  const compCanvas = document.createElement('canvas');
  compCanvas.width = width;
  compCanvas.height = height;
  const compCtx = compCanvas.getContext('2d', { alpha: true });
  if (!compCtx) throw new Error('Could not initialise Canvas context for GIF parsing.');

  const frames: DecodedFrame[] = [];

  for (let i = 0; i < numFrames; i++) {
    const info = reader.frameInfo(i);
    const previousState = info.disposal === 3 ? compCtx.getImageData(0, 0, width, height) : null;

    const frameImgData = compCtx.createImageData(width, height);
    reader.decodeAndBlitFrameRGBA(i, frameImgData.data);

    // Composite non-transparent pixels of current frame onto cumulative canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.putImageData(frameImgData, 0, 0);
    compCtx.drawImage(tempCanvas, 0, 0);

    // Snapshot the composited frame
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = width;
    snapCanvas.height = height;
    snapCanvas.getContext('2d')!.drawImage(compCanvas, 0, 0);

    frames.push({
      canvas: snapCanvas,
      delay: info.delay > 0 ? info.delay : 10,
    });

    // Apply GIF frame disposal method
    if (info.disposal === 2) {
      compCtx.clearRect(info.x, info.y, info.width, info.height);
    } else if (info.disposal === 3 && previousState) {
      compCtx.putImageData(previousState, 0, 0);
    }
  }

  return { frames, isAnimated: numFrames > 1 };
};

/**
 * Normalises any supported input file into one or more composited HTMLCanvasElements.
 */
export const prepareImageSource = async (file: File): Promise<PreparedSource> => {
  const fileName = file.name.toLowerCase();

  // 1. GIF (Static or Animated)
  const isGif = file.type === 'image/gif' || fileName.endsWith('.gif');
  if (isGif) {
    const buffer = await file.arrayBuffer();
    return await decodeGifFrames(buffer);
  }

  // 2. HEIC / HEIF
  const isHeic =
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    fileName.endsWith('.heic') ||
    fileName.endsWith('.heif');

  let standardBlob: Blob = file;

  if (isHeic) {
    const conversionResult = await heic2any({
      blob: file,
      toType: 'image/png',
      quality: 1,
    });
    standardBlob = Array.isArray(conversionResult) ? conversionResult[0] : conversionResult;
  }

  // 3. TIFF
  const isTiff =
    file.type === 'image/tiff' ||
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

    return { frames: [{ canvas, delay: 10 }], isAnimated: false };
  }

  // 4. Standard Web Images (PNG, JPEG, WebP, Clipboard Paste)
  const bitmap = await createImageBitmap(standardBlob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('Could not initialise Canvas 2D context.');
  ctx.drawImage(bitmap, 0, 0);

  return { frames: [{ canvas, delay: 10 }], isAnimated: false };
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

    if (data[p + 3] === 0) continue;

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
 * Erodes the outer alpha edge by `passes` pixels to eliminate white/black anti-aliasing halos.
 */
const applyAlphaDefringe = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  passes: number
) => {
  for (let pass = 0; pass < passes; pass++) {
    const alphaCopy = new Uint8ClampedArray(width * height);
    for (let i = 0; i < width * height; i++) {
      alphaCopy[i] = data[i * 4 + 3];
    }

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (alphaCopy[idx] === 0) continue;

        const hasTransparentNeighbour =
          alphaCopy[idx - 1] === 0 ||
          alphaCopy[idx + 1] === 0 ||
          alphaCopy[idx - width] === 0 ||
          alphaCopy[idx + width] === 0;

        if (hasTransparentNeighbour) {
          data[idx * 4 + 3] = 0;
        }
      }
    }
  }
};

/**
 * Shared knockout & defringe pass used by both the batch encoder and live Eyedropper preview.
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

  if (settings.bgDefringe > 0) {
    applyAlphaDefringe(data, width, height, settings.bgDefringe);
  }

  ctx.putImageData(imgData, 0, 0);
};

export const convertImageBlob = async (
  prepared: PreparedSource,
  settings: ConversionSettings
): Promise<{ blob: Blob; dimensions: { width: number; height: number } }> => {
  const firstFrame = prepared.frames[0].canvas;
  let width = firstFrame.width;
  let height = firstFrame.height;

  if (settings.maxWidth && width > settings.maxWidth) {
    height = Math.round((height * settings.maxWidth) / width);
    width = settings.maxWidth;
  }
  if (settings.maxHeight && height > settings.maxHeight) {
    width = Math.round((width * settings.maxHeight) / height);
    height = settings.maxHeight;
  }

  const renderProcessedFrame = (srcCanvas: HTMLCanvasElement): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Could not initialise Canvas 2D rendering context');

    const isTargetJpeg = settings.targetFormat === 'image/jpeg';
    if ((isTargetJpeg || !settings.preserveAlpha) && !settings.removeBackground) {
      ctx.fillStyle = settings.matteColor === 'transparent' ? '#ffffff' : settings.matteColor;
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.clearRect(0, 0, width, height);
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(srcCanvas, 0, 0, width, height);

    if (settings.removeBackground) {
      applyBackgroundKnockout(ctx, width, height, settings);
    }

    return canvas;
  };

  // Multi-frame or single-frame GIF export via gifenc
  if (settings.targetFormat === 'image/gif') {
    const gif = GIFEncoder();
    const preserveAlpha = settings.preserveAlpha || settings.removeBackground;
    const format = preserveAlpha ? 'rgba4444' : 'rgb565';

    for (let i = 0; i < prepared.frames.length; i++) {
      const frame = prepared.frames[i];
      const processedCanvas = renderProcessedFrame(frame.canvas);
      const ctx = processedCanvas.getContext('2d')!;
      const { data } = ctx.getImageData(0, 0, width, height);

      const palette = quantize(data, 256, {
        format,
        oneBitAlpha: true,
      });

      const index = applyPalette(data, palette, format);

      let transparentIndex = -1;
      if (preserveAlpha) {
        transparentIndex = palette.findIndex((rgba: number[]) => rgba[3] === 0);
      }

      gif.writeFrame(index, width, height, {
        palette,
        delay: frame.delay * 10, // gifenc expects milliseconds
        dispose: 2, // Clear frame before next frame so transparent animated GIFs don't smear
        transparent: transparentIndex !== -1,
        transparentIndex: transparentIndex !== -1 ? transparentIndex : 0,
      });
    }

    gif.finish();
    const gifBlob = new Blob([gif.bytes()], { type: 'image/gif' });
    return { blob: gifBlob, dimensions: { width, height } };
  }

  // Single-frame WebP, PNG, or JPEG export
  const processedCanvas = renderProcessedFrame(firstFrame);
  return new Promise((resolve, reject) => {
    processedCanvas.toBlob(
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
