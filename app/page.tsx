'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import manifest from '../data/brutalismManifest.json';

// ============================================================
// CONFIGURATION
// ============================================================

const DISPLAY_MS = 5000;        // Time each image is displayed
const TRANSITION_MS = 1500;     // Duration of mosaic transition
const MAX_BLOCK_SIZE = 48;      // Maximum pixel block size at peak of transition
const MIN_BLOCK_SIZE = 1;       // Normal resolution (1 = no pixelation)

// Easing function for smooth acceleration/deceleration
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ============================================================
// MOSAIC RENDERER
// ============================================================

// Offscreen canvas for downscaling (reused for performance)
let offscreenCanvas: HTMLCanvasElement | null = null;
let offscreenCtx: CanvasRenderingContext2D | null = null;

/**
 * Draw an image to canvas with mosaic/pixelation effect.
 * Uses efficient canvas scaling: downscale to small size, then upscale with no smoothing.
 * blockSize = 1 means normal resolution, higher = more pixelated.
 */
function drawMosaic(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number,
  blockSize: number
): void {
  // Calculate cover-fit source rectangle
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

  if (blockSize <= 1) {
    // No pixelation - draw normally with smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvasWidth, canvasHeight);
    return;
  }

  // Round block size to integer for grid alignment
  const block = Math.round(blockSize);

  // Calculate small canvas dimensions (number of mosaic blocks)
  const smallWidth = Math.ceil(canvasWidth / block);
  const smallHeight = Math.ceil(canvasHeight / block);

  // Initialize or resize offscreen canvas
  if (!offscreenCanvas) {
    offscreenCanvas = document.createElement('canvas');
    offscreenCtx = offscreenCanvas.getContext('2d', { alpha: false });
  }

  if (offscreenCanvas.width !== smallWidth || offscreenCanvas.height !== smallHeight) {
    offscreenCanvas.width = smallWidth;
    offscreenCanvas.height = smallHeight;
  }

  if (!offscreenCtx) return;

  // Step 1: Draw image to small canvas (downscale with smoothing)
  offscreenCtx.imageSmoothingEnabled = true;
  offscreenCtx.imageSmoothingQuality = 'medium';
  offscreenCtx.drawImage(image, sx, sy, sw, sh, 0, 0, smallWidth, smallHeight);

  // Step 2: Draw small canvas to main canvas (upscale WITHOUT smoothing = pixelated)
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(offscreenCanvas, 0, 0, smallWidth, smallHeight, 0, 0, canvasWidth, canvasHeight);
}

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

  // Draw current frame
  const drawFrame = useCallback((blockSize: number, imageIndex: number) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      console.warn('[drawFrame] No canvas ref');
      return;
    }

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      console.warn('[drawFrame] No canvas context');
      return;
    }

    const src = images[imageIndex];
    const img = loadedImages.get(src);
    if (!img) {
      console.warn('[drawFrame] Image not loaded:', imageIndex, src);
      return;
    }

    console.log('[drawFrame] Drawing image', imageIndex, 'blockSize:', blockSize.toFixed(1));
    drawMosaic(ctx, img, canvas.width, canvas.height, blockSize);
  }, [images, loadedImages]);

  // Mosaic transition animation
  const runTransition = useCallback((fromIndex: number, toIndex: number) => {
    console.log('[runTransition] Starting transition from', fromIndex, 'to', toIndex);
    setIsTransitioning(true);
    isTransitioningRef.current = true;

    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / TRANSITION_MS, 1);

      let blockSize: number;
      let imageIndex: number;

      if (progress < 0.5) {
        // First half: pixelate OUT (current image, block size increases)
        const t = progress * 2; // 0 to 1 over first half
        const eased = easeInOutCubic(t);
        blockSize = MIN_BLOCK_SIZE + (MAX_BLOCK_SIZE - MIN_BLOCK_SIZE) * eased;
        imageIndex = fromIndex;
      } else {
        // Second half: pixelate IN (new image, block size decreases)
        const t = (progress - 0.5) * 2; // 0 to 1 over second half
        const eased = easeInOutCubic(t);
        blockSize = MAX_BLOCK_SIZE - (MAX_BLOCK_SIZE - MIN_BLOCK_SIZE) * eased;
        imageIndex = toIndex;
      }

      drawFrame(blockSize, imageIndex);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        // Transition complete
        console.log('[runTransition] Transition complete, now at index', toIndex);
        setCurrentIndex(toIndex);
        setIsTransitioning(false);
        isTransitioningRef.current = false;
        animationRef.current = null;
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  }, [drawFrame]);

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      console.warn('[Resize] No canvas ref');
      return;
    }

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      console.log('[Resize] Canvas resized to', canvas.width, 'x', canvas.height);
      if (!isTransitioning && loadedImages.size > 0) {
        console.log('[Resize] Drawing initial frame');
        drawFrame(MIN_BLOCK_SIZE, currentIndex);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentIndex, isTransitioning, drawFrame, loadedImages.size]);

  // Draw initial frame when images load
  useEffect(() => {
    console.log('[InitialDraw] Effect running. loadedImages:', loadedImages.size, 'isTransitioning:', isTransitioning);
    if (loadedImages.size > 0 && !isTransitioning) {
      console.log('[InitialDraw] Drawing frame for index', currentIndex);
      drawFrame(MIN_BLOCK_SIZE, currentIndex);
    }
  }, [loadedImages.size, currentIndex, isTransitioning, drawFrame]);

  // Main slideshow loop - use ref for currentIndex to avoid recreating interval
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  useEffect(() => {
    console.log('[MainLoop] Effect running. images:', images.length, 'loaded:', loadedImages.size);

    if (images.length === 0 || loadedImages.size === 0) {
      console.log('[MainLoop] Not ready yet, skipping interval setup');
      return;
    }

    console.log('[MainLoop] Setting up interval for', DISPLAY_MS, 'ms');
    const interval = setInterval(() => {
      console.log('[MainLoop] Interval fired. isTransitioningRef:', isTransitioningRef.current);
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
      console.log('[MainLoop] Cleanup - clearing interval');
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
