export type OutputFormat = 'image/webp' | 'image/jpeg' | 'image/png' | 'image/gif';

export type MatteColor = '#ffffff' | '#000000' | 'transparent';

export interface ConversionSettings {
  targetFormat: OutputFormat;
  quality: number;
  preserveAlpha: boolean;
  matteColor: MatteColor;
  stripExif: boolean;
  maxWidth?: number;
  maxHeight?: number;
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
  convertedBlob?: Blob;
  convertedSize?: number;
  dimensions?: { width: number; height: number };
  errorMessage?: string;
}
