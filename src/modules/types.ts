/**
 * Supported MIME types for browser-side image encoding.
 */
export type OutputFormat = 'image/webp' | 'image/jpeg' | 'image/png' | 'image/gif';

/**
 * Background fill options applied when exporting to non-transparent formats (such as JPEG)
 * or when native alpha preservation is disabled.
 */
export type MatteColor = '#ffffff' | '#000000' | 'transparent';

/**
 * Represents a user-clicked background sample coordinate in the Multi-Point Eyedropper.
 */
export interface SamplePoint {
  x: number; // Normalised horizontal coordinate (0.0 to 1.0)
  y: number; // Normalised vertical coordinate (0.0 to 1.0)
  color: string; // Hex RGB color sampled at the clicked pixel
}

/**
 * Complete batch conversion and background knockout configuration state.
 */
export interface ConversionSettings {
  targetFormat: OutputFormat;
  quality: number; // Lossy compression factor from 0.10 to 1.00 (WebP/JPEG)
  preserveAlpha: boolean;
  matteColor: MatteColor;
  stripExif: boolean;
  maxWidth?: number;
  maxHeight?: number;
  removeBackground: boolean;
  bgTargetColor: string; // 'auto' (top-left pixel) or explicit '#rrggbb' hex
  bgTolerance: number; // Color distance threshold (1 to 60%)
  bgDefringe: number; // Edge alpha erosion passes (0 to 3 pixels)
  bgContiguous: boolean; // True = flood-fill contiguous pocket; False = global color match
  samplePoints: SamplePoint[];
}

/**
 * Processing lifecycle states for an individual file in the conversion queue.
 */
export type ConversionStatus = 'idle' | 'converting' | 'completed' | 'error';

/**
 * Tracks source metadata, preview object URLs, and encoded output for one queued image.
 */
export interface ImageQueueItem {
  id: string;
  file: File;
  originalName: string;
  originalSize: number;
  originalType: string;
  originalUrl: string;
  previewUrl: string;
  status: ConversionStatus;
  convertedBlob?: Blob;
  convertedSize?: number;
  dimensions?: { width: number; height: number };
  errorMessage?: string;
}
