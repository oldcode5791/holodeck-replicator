export type OutputFormat = 'image/jpeg' | 'image/png' | 'image/webp';

export type MatteColor = 'transparent' | '#ffffff' | '#000000';

export interface ConversionSettings {
  targetFormat: OutputFormat;
  quality: number; // 0.1 to 1.0
  maxWidth?: number;
  maxHeight?: number;
  preserveAlpha: boolean;
  matteColor: MatteColor; // Fallback matte if converting transparent image to JPEG
  stripExif: boolean;
}

export type ConversionStatus = 'idle' | 'converting' | 'completed' | 'error';

export interface ImageQueueItem {
  id: string;
  file: File;
  originalName: string;
  originalSize: number;
  originalType: string;
  previewUrl: string;
  status: ConversionStatus;
  errorMessage?: string;
  convertedBlob?: Blob;
  convertedSize?: number;
  dimensions?: { width: number; height: number };
}
