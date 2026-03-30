export type PixelCropInput = string | Blob | ImageBitmap | HTMLImageElement;

export type PixelWhitespaceCropOptions = {
  whiteThreshold?: number;
  alphaThreshold?: number;
  paddingPx?: number;
  mimeType?: string;
  quality?: number;
  output?: "blob" | "dataUrl";
};

export type PixelCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PixelWhitespaceCropResult = {
  sourceWidth: number;
  sourceHeight: number;
  cropRect: PixelCropRect;
  outputWidth: number;
  outputHeight: number;
  blob?: Blob;
  dataUrl?: string;
};

const DEFAULT_OPTIONS: Required<PixelWhitespaceCropOptions> = {
  whiteThreshold: 248,
  alphaThreshold: 8,
  paddingPx: 0,
  mimeType: "image/jpeg",
  quality: 0.9,
  output: "blob"
};

let sourceCanvas: HTMLCanvasElement | null = null;
let sourceContext: CanvasRenderingContext2D | null = null;
let cropCanvas: HTMLCanvasElement | null = null;
let cropContext: CanvasRenderingContext2D | null = null;

function getOrCreateSourceContext() {
  if (!sourceCanvas) sourceCanvas = document.createElement("canvas");
  if (!sourceContext) sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  return { canvas: sourceCanvas, ctx: sourceContext };
}

function getOrCreateCropContext() {
  if (!cropCanvas) cropCanvas = document.createElement("canvas");
  if (!cropContext) cropContext = cropCanvas.getContext("2d", { willReadFrequently: false });
  return { canvas: cropCanvas, ctx: cropContext };
}

function clamp(value: number, min: number, max: number) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

async function loadBitmap(input: PixelCropInput): Promise<{ bitmap: ImageBitmap; shouldClose: boolean }> {
  if (input instanceof ImageBitmap) {
    return { bitmap: input, shouldClose: false };
  }

  if (input instanceof Blob) {
    const bitmap = await createImageBitmap(input);
    return { bitmap, shouldClose: true };
  }

  if (typeof input === "string") {
    const response = await fetch(input);
    if (!response.ok) {
      throw new Error(`Failed to load image (${response.status}) from ${input}`);
    }
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    return { bitmap, shouldClose: true };
  }

  if ("decode" in input) {
    await input.decode().catch(() => undefined);
  }
  const bitmap = await createImageBitmap(input);
  return { bitmap, shouldClose: true };
}

function isBackgroundPixel(
  data: Uint8ClampedArray,
  offset: number,
  whiteThreshold: number,
  alphaThreshold: number
) {
  const a = data[offset + 3];
  if (a <= alphaThreshold) return true;

  const r = data[offset];
  const g = data[offset + 1];
  const b = data[offset + 2];
  return r >= whiteThreshold && g >= whiteThreshold && b >= whiteThreshold;
}

function findPixelBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  whiteThreshold: number,
  alphaThreshold: number
): PixelCropRect | null {
  let top = -1;
  for (let y = 0; y < height; y += 1) {
    let hasForeground = false;
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const offset = rowOffset + x * 4;
      if (!isBackgroundPixel(data, offset, whiteThreshold, alphaThreshold)) {
        hasForeground = true;
        break;
      }
    }
    if (hasForeground) {
      top = y;
      break;
    }
  }

  if (top < 0) return null;

  let bottom = -1;
  for (let y = height - 1; y >= top; y -= 1) {
    let hasForeground = false;
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const offset = rowOffset + x * 4;
      if (!isBackgroundPixel(data, offset, whiteThreshold, alphaThreshold)) {
        hasForeground = true;
        break;
      }
    }
    if (hasForeground) {
      bottom = y;
      break;
    }
  }

  let left = -1;
  for (let x = 0; x < width; x += 1) {
    let hasForeground = false;
    for (let y = top; y <= bottom; y += 1) {
      const offset = (y * width + x) * 4;
      if (!isBackgroundPixel(data, offset, whiteThreshold, alphaThreshold)) {
        hasForeground = true;
        break;
      }
    }
    if (hasForeground) {
      left = x;
      break;
    }
  }

  let right = -1;
  for (let x = width - 1; x >= left; x -= 1) {
    let hasForeground = false;
    for (let y = top; y <= bottom; y += 1) {
      const offset = (y * width + x) * 4;
      if (!isBackgroundPixel(data, offset, whiteThreshold, alphaThreshold)) {
        hasForeground = true;
        break;
      }
    }
    if (hasForeground) {
      right = x;
      break;
    }
  }

  return {
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1
  };
}

function toBlobAsync(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to encode canvas blob"));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

export async function cropImageWhitespaceByPixels(
  input: PixelCropInput,
  options: PixelWhitespaceCropOptions = {}
): Promise<PixelWhitespaceCropResult> {
  const merged = { ...DEFAULT_OPTIONS, ...options };
  const { bitmap, shouldClose } = await loadBitmap(input);

  try {
    const source = getOrCreateSourceContext();
    if (!source.ctx) {
      throw new Error("Unable to get source canvas context");
    }

    source.canvas.width = bitmap.width;
    source.canvas.height = bitmap.height;
    source.ctx.clearRect(0, 0, bitmap.width, bitmap.height);
    source.ctx.drawImage(bitmap, 0, 0);

    const imageData = source.ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const found = findPixelBounds(
      imageData.data,
      bitmap.width,
      bitmap.height,
      merged.whiteThreshold,
      merged.alphaThreshold
    );

    const baseRect = found ?? { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
    const x = clamp(baseRect.x - merged.paddingPx, 0, bitmap.width);
    const y = clamp(baseRect.y - merged.paddingPx, 0, bitmap.height);
    const right = clamp(baseRect.x + baseRect.width + merged.paddingPx, 0, bitmap.width);
    const bottom = clamp(baseRect.y + baseRect.height + merged.paddingPx, 0, bitmap.height);
    const width = Math.max(1, right - x);
    const height = Math.max(1, bottom - y);

    const crop = getOrCreateCropContext();
    if (!crop.ctx) {
      throw new Error("Unable to get crop canvas context");
    }

    crop.canvas.width = width;
    crop.canvas.height = height;
    crop.ctx.clearRect(0, 0, width, height);
    crop.ctx.drawImage(source.canvas, x, y, width, height, 0, 0, width, height);

    const result: PixelWhitespaceCropResult = {
      sourceWidth: bitmap.width,
      sourceHeight: bitmap.height,
      cropRect: { x, y, width, height },
      outputWidth: width,
      outputHeight: height
    };

    if (merged.output === "dataUrl") {
      result.dataUrl = crop.canvas.toDataURL(merged.mimeType, merged.quality);
      return result;
    }

    result.blob = await toBlobAsync(crop.canvas, merged.mimeType, merged.quality);
    return result;
  } finally {
    if (shouldClose) {
      bitmap.close();
    }
  }
}
