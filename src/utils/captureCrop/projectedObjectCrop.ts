import type { Camera, Object3D } from "three";
import { Box3, Vector3 } from "three";

export type ProjectedObjectCropOptions = {
  sourceCanvas: HTMLCanvasElement;
  camera: Camera | null;
  target: Object3D | null;
  paddingPx?: number;
  mimeType?: string;
  quality?: number;
};

export type ScreenRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const tmpBox = new Box3();
const tmpCorner = new Vector3();
let sharedCropCanvas: HTMLCanvasElement | null = null;
let sharedEncodeCanvas: HTMLCanvasElement | null = null;

function clamp(value: number, min: number, max: number) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function isJpegMimeType(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  return normalized === "image/jpeg" || normalized === "image/jpg";
}

function encodeCanvasToDataUrl(canvas: HTMLCanvasElement, mimeType: string, quality: number) {
  if (!isJpegMimeType(mimeType)) {
    return canvas.toDataURL(mimeType, quality);
  }

  const encodeCanvas = sharedEncodeCanvas ?? document.createElement("canvas");
  sharedEncodeCanvas = encodeCanvas;
  encodeCanvas.width = canvas.width;
  encodeCanvas.height = canvas.height;

  const ctx = encodeCanvas.getContext("2d", { willReadFrequently: false });
  if (!ctx) return canvas.toDataURL(mimeType, quality);

  ctx.clearRect(0, 0, encodeCanvas.width, encodeCanvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, encodeCanvas.width, encodeCanvas.height);
  ctx.drawImage(canvas, 0, 0);
  return encodeCanvas.toDataURL(mimeType, quality);
}

function getFallbackDataUrl(sourceCanvas: HTMLCanvasElement, mimeType: string, quality: number) {
  return encodeCanvasToDataUrl(sourceCanvas, mimeType, quality);
}

export function getProjectedObjectScreenRect(
  sourceCanvas: HTMLCanvasElement,
  camera: Camera | null,
  target: Object3D | null,
  paddingPx = 0
): ScreenRect | null {
  if (!camera || !target || sourceCanvas.width <= 0 || sourceCanvas.height <= 0) return null;

  target.updateWorldMatrix(true, true);
  camera.updateMatrixWorld(true);

  tmpBox.setFromObject(target);
  if (tmpBox.isEmpty()) return null;

  const { min, max } = tmpBox;
  const corners: [number, number, number][] = [
    [min.x, min.y, min.z],
    [min.x, min.y, max.z],
    [min.x, max.y, min.z],
    [min.x, max.y, max.z],
    [max.x, min.y, min.z],
    [max.x, min.y, max.z],
    [max.x, max.y, min.z],
    [max.x, max.y, max.z]
  ];

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const [x, y, z] of corners) {
    tmpCorner.set(x, y, z).project(camera);
    if (!Number.isFinite(tmpCorner.x) || !Number.isFinite(tmpCorner.y)) continue;

    const sx = (tmpCorner.x * 0.5 + 0.5) * sourceCanvas.width;
    const sy = (0.5 - tmpCorner.y * 0.5) * sourceCanvas.height;

    if (sx < minX) minX = sx;
    if (sx > maxX) maxX = sx;
    if (sy < minY) minY = sy;
    if (sy > maxY) maxY = sy;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  minX = clamp(minX - paddingPx, 0, sourceCanvas.width);
  minY = clamp(minY - paddingPx, 0, sourceCanvas.height);
  maxX = clamp(maxX + paddingPx, 0, sourceCanvas.width);
  maxY = clamp(maxY + paddingPx, 0, sourceCanvas.height);

  const x = Math.floor(minX);
  const y = Math.floor(minY);
  const width = Math.max(1, Math.ceil(maxX) - x);
  const height = Math.max(1, Math.ceil(maxY) - y);

  if (width <= 0 || height <= 0) return null;

  return { x, y, width, height };
}

export function captureCanvasWithProjectedObjectCrop({
  sourceCanvas,
  camera,
  target,
  paddingPx = 8,
  mimeType = "image/jpeg",
  quality = 0.9
}: ProjectedObjectCropOptions): string {
  if (sourceCanvas.width <= 0 || sourceCanvas.height <= 0) {
    return "";
  }

  const rect = getProjectedObjectScreenRect(sourceCanvas, camera, target, paddingPx);
  if (!rect) {
    return getFallbackDataUrl(sourceCanvas, mimeType, quality);
  }

  const { x, y, width, height } = rect;
  if (x === 0 && y === 0 && width >= sourceCanvas.width && height >= sourceCanvas.height) {
    return getFallbackDataUrl(sourceCanvas, mimeType, quality);
  }

  const cropCanvas = sharedCropCanvas ?? document.createElement("canvas");
  sharedCropCanvas = cropCanvas;
  cropCanvas.width = width;
  cropCanvas.height = height;

  const ctx = cropCanvas.getContext("2d", { willReadFrequently: false });
  if (!ctx) {
    return getFallbackDataUrl(sourceCanvas, mimeType, quality);
  }

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(sourceCanvas, x, y, width, height, 0, 0, width, height);
  return encodeCanvasToDataUrl(cropCanvas, mimeType, quality);
}
