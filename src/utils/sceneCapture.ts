import type { Camera, Group, WebGLRenderer } from "three";
import { captureCanvasWithProjectedObjectCrop } from "./captureCrop/projectedObjectCrop";

export function captureSceneImage(
  gl: WebGLRenderer | null,
  camera: Camera | null,
  target: Group | null
): string {
  if (!gl) return "";
  return captureCanvasWithProjectedObjectCrop({
    sourceCanvas: gl.domElement,
    camera,
    target,
    paddingPx: 8,
    mimeType: "image/jpeg",
    quality: 0.9
  });
}
