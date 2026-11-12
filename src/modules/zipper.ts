import JSZip from 'jszip';
import type { ImageQueueItem, ConversionSettings } from './types';
import { getExtensionForFormat } from './converter';

/**
 * Bundles all completed images in the conversion queue into a single DEFLATE-compressed
 * ZIP archive inside browser memory for one-click batch download.
 */
export const packageBatchZip = async (
  items: ImageQueueItem[],
  settings: ConversionSettings
): Promise<Blob> => {
  const zip = new JSZip();
  const extension = getExtensionForFormat(settings.targetFormat);

  items.forEach((item, index) => {
    if (item.convertedBlob && item.status === 'completed') {
      const baseName = item.originalName.replace(/\.[^/.]+$/, '');
      const uniqueName = `${baseName}_converted_${index + 1}.${extension}`;
      zip.file(uniqueName, item.convertedBlob);
    }
  });

  return await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
};
