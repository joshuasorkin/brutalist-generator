'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import manifest from '../data/brutalismManifest.json';

// ============================================================
// CONFIGURATION
// ============================================================

const DISPLAY_MS = 10000;           // Time each image is displayed
const TRANSITION_MS = 3000;        // Duration of transitions
const MAX_BLOCK_SIZE = 48;         // Mosaic: maximum pixel block size at peak
const MIN_BLOCK_SIZE = 1;          // Mosaic: normal resolution (1 = no pixelation)
const GRID_COLS = 16;               // Grid reveal: columns
const GRID_ROWS = 12;               // Grid reveal: rows
const CELL_FADE_DURATION = 0.1;    // Grid reveal: each cell fades in over 10% of transition

// ============================================================
// TRANSITION TYPES
// ============================================================

interface TransitionState {
  [key: string]: unknown;
}

interface Transition {
  name: string;
  init: (
    ctx: CanvasRenderingContext2D,
    fromImg: HTMLImageElement,
    toImg: HTMLImageElement,
    width: number,
    height: number
  ) => TransitionState;
  render: (
    ctx: CanvasRenderingContext2D,
    fromImg: HTMLImageElement,
    toImg: HTMLImageElement,
    width: number,
    height: number,
    progress: number,
    state: TransitionState
  ) => void;
}

// Easing function for smooth acceleration/deceleration
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ============================================================
// SHARED HELPERS
// ============================================================

/**
 * Calculate cover-fit source rectangle for an image.
 * Returns the portion of the source image to draw to fill the canvas.
 */
function getCoverFitRect(
  image: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number
): { sx: number; sy: number; sw: number; sh: number } {
  const imgAspect = image.naturalWidth / image.naturalHeight;
  const canvasAspect = canvasWidth / canvasHeight;

  let sx = 0, sy = 0, sw = image.naturalWidth, sh = image.naturalHeight;

  if (imgAspect > canvasAspect) {
    // Image is wider - crop sides
    sw = image.naturalHeight * canvasAspect;
    sx = (image.naturalWidth - sw) / 2;
  } else {
    // Image is taller - crop top/bottom
    sh = image.naturalWidth / canvasAspect;
    sy = (image.naturalHeight - sh) / 2;
  }

  return { sx, sy, sw, sh };
}

/**
 * Draw an image to canvas with cover-fit (fill canvas, crop excess).
 */
function drawImageCoverFit(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number
): void {
  const { sx, sy, sw, sh } = getCoverFitRect(image, canvasWidth, canvasHeight);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvasWidth, canvasHeight);
}

/**
 * Fisher-Yates shuffle for randomizing arrays.
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ============================================================
// MOSAIC TRANSITION
// ============================================================

// Offscreen canvas for downscaling (reused for performance)
let mosaicOffscreenCanvas: HTMLCanvasElement | null = null;
let mosaicOffscreenCtx: CanvasRenderingContext2D | null = null;

/**
 * Draw an image with mosaic/pixelation effect.
 */
function drawMosaicImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number,
  blockSize: number
): void {
  const { sx, sy, sw, sh } = getCoverFitRect(image, canvasWidth, canvasHeight);

  if (blockSize <= 1) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvasWidth, canvasHeight);
    return;
  }

  const block = Math.round(blockSize);
  const smallWidth = Math.ceil(canvasWidth / block);
  const smallHeight = Math.ceil(canvasHeight / block);

  if (!mosaicOffscreenCanvas) {
    mosaicOffscreenCanvas = document.createElement('canvas');
    mosaicOffscreenCtx = mosaicOffscreenCanvas.getContext('2d', { alpha: false });
  }

  if (mosaicOffscreenCanvas.width !== smallWidth || mosaicOffscreenCanvas.height !== smallHeight) {
    mosaicOffscreenCanvas.width = smallWidth;
    mosaicOffscreenCanvas.height = smallHeight;
  }

  if (!mosaicOffscreenCtx) return;

  mosaicOffscreenCtx.imageSmoothingEnabled = true;
  mosaicOffscreenCtx.imageSmoothingQuality = 'medium';
  mosaicOffscreenCtx.drawImage(image, sx, sy, sw, sh, 0, 0, smallWidth, smallHeight);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mosaicOffscreenCanvas, 0, 0, smallWidth, smallHeight, 0, 0, canvasWidth, canvasHeight);
}

const mosaicTransition: Transition = {
  name: 'mosaic',
  init: () => ({}),
  render: (ctx, fromImg, toImg, width, height, progress) => {
    let blockSize: number;
    let image: HTMLImageElement;

    if (progress < 0.5) {
      // First half: pixelate OUT (from image, block size increases)
      const t = progress * 2;
      const eased = easeInOutCubic(t);
      blockSize = MIN_BLOCK_SIZE + (MAX_BLOCK_SIZE - MIN_BLOCK_SIZE) * eased;
      image = fromImg;
    } else {
      // Second half: pixelate IN (to image, block size decreases)
      const t = (progress - 0.5) * 2;
      const eased = easeInOutCubic(t);
      blockSize = MAX_BLOCK_SIZE - (MAX_BLOCK_SIZE - MIN_BLOCK_SIZE) * eased;
      image = toImg;
    }

    drawMosaicImage(ctx, image, width, height, blockSize);
  },
};

// ============================================================
// GRID REVEAL TRANSITION
// ============================================================

interface GridRevealState extends TransitionState {
  cellOrder: number[];
  cellWidth: number;
  cellHeight: number;
}

// Offscreen canvas for clipping cells
let gridOffscreenCanvas: HTMLCanvasElement | null = null;
let gridOffscreenCtx: CanvasRenderingContext2D | null = null;

const gridRevealTransition: Transition = {
  name: 'gridReveal',
  init: (_ctx, _fromImg, _toImg, width, height) => {
    // Create array of cell indices and shuffle
    const totalCells = GRID_COLS * GRID_ROWS;
    const cellOrder = shuffleArray(Array.from({ length: totalCells }, (_, i) => i));

    return {
      cellOrder,
      cellWidth: width / GRID_COLS,
      cellHeight: height / GRID_ROWS,
    } as GridRevealState;
  },
  render: (ctx, fromImg, toImg, width, height, progress, state) => {
    const { cellOrder, cellWidth, cellHeight } = state as GridRevealState;
    const totalCells = cellOrder.length;

    // Draw the "from" image as the base
    drawImageCoverFit(ctx, fromImg, width, height);

    // Prepare offscreen canvas for the "to" image
    if (!gridOffscreenCanvas) {
      gridOffscreenCanvas = document.createElement('canvas');
      gridOffscreenCtx = gridOffscreenCanvas.getContext('2d', { alpha: false });
    }
    if (gridOffscreenCanvas.width !== width || gridOffscreenCanvas.height !== height) {
      gridOffscreenCanvas.width = width;
      gridOffscreenCanvas.height = height;
    }
    if (!gridOffscreenCtx) return;

    // Draw the full "to" image to offscreen canvas
    drawImageCoverFit(gridOffscreenCtx, toImg, width, height);

    // Draw revealed cells with fade-in
    for (let i = 0; i < totalCells; i++) {
      // Calculate when this cell starts revealing (staggered)
      const startTime = (i / totalCells) * (1 - CELL_FADE_DURATION);

      // Calculate cell opacity based on current progress
      let cellOpacity = (progress - startTime) / CELL_FADE_DURATION;
      cellOpacity = Math.max(0, Math.min(1, cellOpacity));

      if (cellOpacity <= 0) continue;

      // Get cell position from shuffled order
      const cellIndex = cellOrder[i];
      const col = cellIndex % GRID_COLS;
      const row = Math.floor(cellIndex / GRID_COLS);
      const x = col * cellWidth;
      const y = row * cellHeight;

      // Draw cell from offscreen canvas with opacity
      ctx.globalAlpha = cellOpacity;
      ctx.drawImage(
        gridOffscreenCanvas,
        x, y, cellWidth, cellHeight,
        x, y, cellWidth, cellHeight
      );
    }

    // Reset alpha
    ctx.globalAlpha = 1;
  },
};

// ============================================================
// CONTAINER TRANSFORM TRANSITION
// ============================================================

interface ContainerState extends TransitionState {
  originX: number;
  originY: number;
  originWidth: number;
  originHeight: number;
}

// Grid size for finding darkest region
const CONTAINER_SAMPLE_COLS = 6;
const CONTAINER_SAMPLE_ROWS = 4;

// Offscreen canvas for sampling brightness
let containerSampleCanvas: HTMLCanvasElement | null = null;
let containerSampleCtx: CanvasRenderingContext2D | null = null;

/**
 * Find the darkest region of an image by sampling a grid.
 * Returns the center coordinates and dimensions of the darkest cell.
 */
function findDarkestRegion(
  image: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number; width: number; height: number } {
  const cellWidth = canvasWidth / CONTAINER_SAMPLE_COLS;
  const cellHeight = canvasHeight / CONTAINER_SAMPLE_ROWS;

  // Create/resize sample canvas
  if (!containerSampleCanvas) {
    containerSampleCanvas = document.createElement('canvas');
    containerSampleCtx = containerSampleCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (containerSampleCanvas.width !== canvasWidth || containerSampleCanvas.height !== canvasHeight) {
    containerSampleCanvas.width = canvasWidth;
    containerSampleCanvas.height = canvasHeight;
  }
  if (!containerSampleCtx) {
    return { x: canvasWidth / 2, y: canvasHeight / 2, width: cellWidth, height: cellHeight };
  }

  // Draw image to sample canvas
  drawImageCoverFit(containerSampleCtx, image, canvasWidth, canvasHeight);

  let darkestBrightness = 255;
  let darkestCol = 0;
  let darkestRow = 0;

  // Sample each cell
  for (let row = 0; row < CONTAINER_SAMPLE_ROWS; row++) {
    for (let col = 0; col < CONTAINER_SAMPLE_COLS; col++) {
      const x = Math.floor(col * cellWidth);
      const y = Math.floor(row * cellHeight);
      const w = Math.floor(cellWidth);
      const h = Math.floor(cellHeight);

      // Get pixel data for this cell
      const imageData = containerSampleCtx.getImageData(x, y, w, h);
      const data = imageData.data;

      // Calculate average brightness (sample every 16th pixel for speed)
      let totalBrightness = 0;
      let sampleCount = 0;
      for (let i = 0; i < data.length; i += 64) { // 16 pixels * 4 channels
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // Perceived brightness formula
        totalBrightness += 0.299 * r + 0.587 * g + 0.114 * b;
        sampleCount++;
      }

      const avgBrightness = totalBrightness / sampleCount;
      if (avgBrightness < darkestBrightness) {
        darkestBrightness = avgBrightness;
        darkestCol = col;
        darkestRow = row;
      }
    }
  }

  return {
    x: darkestCol * cellWidth + cellWidth / 2,
    y: darkestRow * cellHeight + cellHeight / 2,
    width: cellWidth,
    height: cellHeight,
  };
}

// Offscreen canvas for container transition
let containerOffscreenCanvas: HTMLCanvasElement | null = null;
let containerOffscreenCtx: CanvasRenderingContext2D | null = null;

const containerTransition: Transition = {
  name: 'container',
  init: (_ctx, fromImg, _toImg, width, height) => {
    // Find darkest region in the "from" image
    const darkest = findDarkestRegion(fromImg, width, height);

    return {
      originX: darkest.x,
      originY: darkest.y,
      originWidth: darkest.width,
      originHeight: darkest.height,
    } as ContainerState;
  },
  render: (ctx, fromImg, toImg, width, height, progress, state) => {
    const { originX, originY, originWidth, originHeight } = state as ContainerState;

    // Draw the "from" image as the base
    drawImageCoverFit(ctx, fromImg, width, height);

    // Apply easing for smooth expansion
    const eased = easeInOutCubic(progress);

    // Calculate expanding rectangle
    // Start: centered at origin, size of origin cell
    // End: full canvas (0, 0, width, height)
    const startWidth = originWidth;
    const startHeight = originHeight;
    const startX = originX - startWidth / 2;
    const startY = originY - startHeight / 2;

    const currentWidth = startWidth + (width - startWidth) * eased;
    const currentHeight = startHeight + (height - startHeight) * eased;
    const currentX = startX + (0 - startX) * eased;
    const currentY = startY + (0 - startY) * eased;

    // Prepare offscreen canvas for the "to" image
    if (!containerOffscreenCanvas) {
      containerOffscreenCanvas = document.createElement('canvas');
      containerOffscreenCtx = containerOffscreenCanvas.getContext('2d', { alpha: false });
    }
    if (containerOffscreenCanvas.width !== width || containerOffscreenCanvas.height !== height) {
      containerOffscreenCanvas.width = width;
      containerOffscreenCanvas.height = height;
    }
    if (!containerOffscreenCtx) return;

    // Draw full "to" image to offscreen canvas
    drawImageCoverFit(containerOffscreenCtx, toImg, width, height);

    // Use clipping to draw only the expanding region
    ctx.save();
    ctx.beginPath();
    ctx.rect(currentX, currentY, currentWidth, currentHeight);
    ctx.clip();

    // Draw the "to" image (clipped to expanding rectangle)
    ctx.drawImage(containerOffscreenCanvas, 0, 0);

    ctx.restore();
  },
};

// ============================================================
// TRANSITION REGISTRY
// ============================================================

const TRANSITIONS: Transition[] = [
  mosaicTransition,
  gridRevealTransition,
  containerTransition,
];

// ============================================================
// COMPONENT
// ============================================================

export default function BrutalistSlideshow() {
  const images = manifest.images;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loadedImages, setLoadedImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const [currentIndex, setCurrentIndex] = useState(() =>
    images.length > 0 ? Math.floor(Math.random() * images.length) : 0
  );
  const [isTransitioning, setIsTransitioning] = useState(false);
  const isTransitioningRef = useRef(false); // Ref to avoid stale closure in setInterval
  const animationRef = useRef<number | null>(null);

  // Preload images
  useEffect(() => {
    if (images.length === 0) return;

    const loaded = new Map<string, HTMLImageElement>();
    let loadCount = 0;

    images.forEach((src) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        loaded.set(src, img);
        loadCount++;
        if (loadCount === images.length) {
          setLoadedImages(new Map(loaded));
        }
      };
      img.src = src;
    });
  }, [images]);

  // Draw static image (for initial display and resize)
  const drawStaticImage = useCallback((imageIndex: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const src = images[imageIndex];
    const img = loadedImages.get(src);
    if (!img) return;

    drawImageCoverFit(ctx, img, canvas.width, canvas.height);
  }, [images, loadedImages]);

  // Run transition animation using selected transition algorithm
  const runTransition = useCallback((fromIndex: number, toIndex: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const fromSrc = images[fromIndex];
    const toSrc = images[toIndex];
    const fromImg = loadedImages.get(fromSrc);
    const toImg = loadedImages.get(toSrc);
    if (!fromImg || !toImg) return;

    setIsTransitioning(true);
    isTransitioningRef.current = true;

    // Select random transition
    const transition = TRANSITIONS[Math.floor(Math.random() * TRANSITIONS.length)];

    // Initialize transition state
    const state = transition.init(ctx, fromImg, toImg, canvas.width, canvas.height);

    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / TRANSITION_MS, 1);

      // Render current frame
      transition.render(ctx, fromImg, toImg, canvas.width, canvas.height, progress, state);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        // Transition complete
        setCurrentIndex(toIndex);
        setIsTransitioning(false);
        isTransitioningRef.current = false;
        animationRef.current = null;
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  }, [images, loadedImages]);

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (!isTransitioning && loadedImages.size > 0) {
        drawStaticImage(currentIndex);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentIndex, isTransitioning, drawStaticImage, loadedImages.size]);

  // Draw initial frame when images load
  useEffect(() => {
    if (loadedImages.size > 0 && !isTransitioning) {
      drawStaticImage(currentIndex);
    }
  }, [loadedImages.size, currentIndex, isTransitioning, drawStaticImage]);

  // Main slideshow loop - use ref for currentIndex to avoid recreating interval
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  useEffect(() => {
    if (images.length === 0 || loadedImages.size === 0) return;

    const interval = setInterval(() => {
      if (!isTransitioningRef.current) {
        const curr = currentIndexRef.current;
        // Pick a random image that's different from current
        let nextIndex = Math.floor(Math.random() * images.length);
        if (images.length > 1) {
          while (nextIndex === curr) {
            nextIndex = Math.floor(Math.random() * images.length);
          }
        }
        runTransition(curr, nextIndex);
      }
    }, DISPLAY_MS);

    return () => {
      clearInterval(interval);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [images.length, loadedImages.size, runTransition]);

  // Handle empty manifest
  if (images.length === 0) {
    return (
      <div className="message">
        No images found. Run the generation script first.
      </div>
    );
  }

  return (
    <div className="screen">
      <canvas
        ref={canvasRef}
        className="mosaic-canvas"
      />
      {loadedImages.size === 0 && (
        <div className="message">Loading images...</div>
      )}
    </div>
  );
}
