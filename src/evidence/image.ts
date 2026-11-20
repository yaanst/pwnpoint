import { stripPngMetadata } from './png';

export const MAX_WIDTH = 2560;
export const MAX_INPUT_BYTES = 50 * 1024 * 1024;
/** Raster formats only. SVG is refused: it is a document that can carry scripts and links. */
export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'];

export class ImageImportError extends Error {
  override name = 'ImageImportError';
}

/** Size that fits within `maxWidth`, keeping the aspect ratio. Never upscales. */
export function fitWithin(width: number, height: number, maxWidth = MAX_WIDTH) {
  if (width <= maxWidth) return { width, height, scaled: false };
  return {
    width: maxWidth,
    height: Math.max(1, Math.round((height * maxWidth) / width)),
    scaled: true,
  };
}

export interface ProcessedImage {
  bytes: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
  /** Original size, before any downscale. */
  originalWidth: number;
  originalHeight: number;
}

/**
 * Re-encodes an image through a canvas: this drops EXIF/GPS, comments and every other piece
 * of metadata, applies the EXIF orientation, and downscales anything wider than MAX_WIDTH.
 * The PNG output then goes through a chunk whitelist as a second guarantee.
 */
export async function processImage(file: Blob): Promise<ProcessedImage> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new ImageImportError(
      `${file.type || 'This file type'} is not supported. Use PNG, JPEG, WebP, GIF or BMP.`,
    );
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new ImageImportError('This image is larger than 50 MB.');
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageImportError('This image could not be read. It may be damaged.');
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  return drawToPng(bitmap, width, height, {
    originalWidth: bitmap.width,
    originalHeight: bitmap.height,
  });
}

/** Draws a source onto a fresh canvas and returns clean PNG bytes. */
export async function drawToPng(
  source: CanvasImageSource & { close?: () => void },
  width: number,
  height: number,
  original: { originalWidth: number; originalHeight: number },
): Promise<ProcessedImage> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageImportError('Your browser could not process this image.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  source.close?.();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new ImageImportError('Your browser could not encode this image.');
  const bytes = stripPngMetadata(new Uint8Array(await blob.arrayBuffer()));
  return { bytes, width, height, ...original };
}

/** Encodes raw RGBA pixels (e.g. after redaction) as clean PNG bytes. */
export async function pixelsToPng(p: {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}): Promise<ProcessedImage> {
  const canvas = document.createElement('canvas');
  canvas.width = p.width;
  canvas.height = p.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageImportError('Your browser could not process this image.');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new ImageImportError('Your browser could not encode this image.');
  const bytes = stripPngMetadata(new Uint8Array(await blob.arrayBuffer()));
  return {
    bytes,
    width: p.width,
    height: p.height,
    originalWidth: p.width,
    originalHeight: p.height,
  };
}

/** Decodes stored PNG bytes into RGBA pixels. */
export async function pngToPixels(bytes: Uint8Array<ArrayBuffer>) {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageImportError('Your browser could not process this image.');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data: img.data, width: img.width, height: img.height };
}
