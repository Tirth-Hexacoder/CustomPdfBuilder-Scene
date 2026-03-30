export type ReviewImageMetadata = {
  cameraPosition?: { x: number; y: number; z: number };
  showDimensions?: boolean;
  showLineDiagram?: boolean;
  showPriceTable?: boolean;
  tableInfo?: unknown;
  pricingOptions?: unknown;
  [key: string]: unknown;
};

export type ReviewImage = {
  id?: string;
  url?: string;
  type?: string;
  cameraInfo?: any;
  info?: {
    openAllDoors: boolean;
    propsType: string;
    showObjects: boolean;
    tempVisibleIndex: boolean[];
    wall: number;
  };
  imageUrl?: string;
  blobUrl?: string;
  metadata?: ReviewImageMetadata;
};

export type ReviewItemBase = {
  itemId: string;
  type: "image" | "text" | "shape" | "annotation";
  position: { x: number; y: number };
  size: { width: number; height: number };
  rotation?: number;
  scale?: { x: number; y: number };
  opacity?: number;
  locked?: boolean;
  hidden?: boolean;
};

export type ReviewImageItem = ReviewItemBase & {
  type: "image";
  imageId: string;
  crop?: {
    cropX: number;
    cropY: number;
    width: number;
    height: number;
    sourceWidth?: number;
    sourceHeight?: number;
  };
};

export type ReviewTextItem = ReviewItemBase & {
  type: "text" | "annotation";
  text: string;
  style?: {
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string | number;
    fontStyle?: string;
    underline?: boolean;
    fill?: string;
    align?: "left" | "center" | "right";
  };
};

export type ReviewShapeItem = ReviewItemBase & {
  type: "shape";
  shape: "rect";
  style?: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    rx?: number;
    ry?: number;
  };
};

export type ReviewItem = ReviewImageItem | ReviewTextItem | ReviewShapeItem;

export type ReviewSnapshot = {
  images: ReviewImage[];
  pages: Array<{ pageId: string; items: ReviewItem[] }>;
};
