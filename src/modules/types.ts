export type OutputFormat = 'image/webp' | 'image/jpeg' | 'image/png' | 'image/gif';

export type MatteColor = '#ffffff' | '#000000' | 'transparent';

export interface SamplePoint {
  x: number; // normalised 0..1
  y: number; // normalised 0..1
  color: string; // hex sampled at click
}

export interface ConversionSettings {
  targetFormat: OutputFormat;
  quality: number;
  preserveAlpha: boolean;
  matteColor: MatteColor;
  stripExif: boolean;
  maxWidth?: number;
  maxHeight?: number;
  removeBackground: boolean;
  bgTargetColor: string; // 'auto', or hex like '#ffffff'
  bgTolerance: number; // 0 to 100
  bgContiguous: boolean;
  samplePoints: SamplePoint[];
}

export type ConversionStatus = 'idle' | 'converting' | 'completed' | 'error';

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
