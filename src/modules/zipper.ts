import JSZip from 'jszip';
import type { ImageQueueItem, ConversionSettings } from './types';
import { getExtensionForFormat } from './converter';

export const packageBatchZip = async (
  items: ImageQueueItem[],
  settings: ConversionSettings
): Promise<Blob> => {
  const zip = new JSZip();
  const ext = getExtensionForFormat(settings.targetFormat);

  items.forEach((item, index) => {
    if (item.convertedBlob) {
      // Remove original extension and attach target extension
      const baseName = item.originalName.replace(/\.[^/.]+$/, "");
      const fileName = `${baseName}_converted.${ext}`;
      
      // Deduplicate file names inside the zip archive if duplicate original names exist
      const uniqueName = zip.file(fileName) 
        ? `${baseName}_converted_${index + 1}.${ext}` 
        : fileName;

      zip.file(uniqueName, item.convertedBlob);
    }
  });

  return await zip.generateAsync({ type: 'blob' });
};
