'use client';

import { useState, useEffect, useCallback } from 'react';
import manifest from '../data/brutalismManifest.json';

// ============================================================
// CONFIGURATION
// ============================================================

const DISPLAY_MS = 5000; // 20 seconds per image
const FADE_MS = 2000;     // 4 second crossfade

// ============================================================
// TYPES
// ============================================================

type SlideState = 'hidden' | 'fade-in' | 'visible' | 'fade-out';

interface SlideInfo {
  index: number;
  state: SlideState;
}

// ============================================================
// COMPONENT
// ============================================================

export default function BrutalistSlideshow() {
  const images = manifest.images;

  // Track current and previous slides
  const [currentSlide, setCurrentSlide] = useState<SlideInfo>({ index: 0, state: 'visible' });
  const [prevSlide, setPrevSlide] = useState<SlideInfo | null>(null);

  // Track if we're in a transition
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Ref to track the zoom animation duration
  const zoomDuration = DISPLAY_MS;

  // Advance to next slide
  const advanceSlide = useCallback(() => {
    if (images.length === 0) return;

    setIsTransitioning(true);

    // Move current to previous and start fading it out
    setCurrentSlide((curr) => {
      setPrevSlide({ index: curr.index, state: 'fade-out' });
      // Set new slide to hidden first (so transition can happen)
      return {
        index: (curr.index + 1) % images.length,
        state: 'hidden',
      };
    });

    // After a frame, trigger the fade-in transition
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setCurrentSlide((curr) => ({ ...curr, state: 'fade-in' }));
      });
    });

    // After fade completes, clean up
    setTimeout(() => {
      setPrevSlide(null);
      setCurrentSlide((curr) => ({ ...curr, state: 'visible' }));
      setIsTransitioning(false);
    }, FADE_MS);

  }, [images.length]);

  // Main slideshow loop
  useEffect(() => {
    if (images.length === 0) return;

    const interval = setInterval(() => {
      if (!isTransitioning) {
        advanceSlide();
      }
    }, DISPLAY_MS);

    return () => clearInterval(interval);
  }, [advanceSlide, isTransitioning, images.length]);

  // Handle empty manifest
  if (images.length === 0) {
    return (
      <div className="message">
        No images found. Run the generation script first.
      </div>
    );
  }

  // Get CSS classes for a slide based on its state
  const getSlideClasses = (state: SlideState, isZooming: boolean): string => {
    const classes = ['slide', 'slide-base'];

    switch (state) {
      case 'hidden':
        classes.push('slide-hidden');
        break;
      case 'fade-in':
        classes.push('slide-fade-in');
        break;
      case 'visible':
        classes.push('slide-visible');
        if (isZooming) classes.push('slide-zooming');
        break;
      case 'fade-out':
        classes.push('slide-fade-out');
        break;
    }

    return classes.join(' ');
  };

  // Calculate transition duration style
  const transitionStyle = {
    transitionDuration: `${FADE_MS}ms`,
  };

  // Calculate zoom animation duration
  const zoomStyle = {
    animationDuration: `${zoomDuration}ms`,
  };

  return (
    <div className="screen">
      {/* Previous slide (fading out) */}
      {prevSlide && (
        <img
          key={`prev-${prevSlide.index}`}
          src={images[prevSlide.index]}
          alt=""
          className={getSlideClasses(prevSlide.state, false)}
          style={transitionStyle}
          draggable={false}
        />
      )}

      {/* Current slide */}
      <img
        key={`curr-${currentSlide.index}`}
        src={images[currentSlide.index]}
        alt=""
        className={getSlideClasses(currentSlide.state, currentSlide.state === 'visible')}
        style={{
          ...transitionStyle,
          ...(currentSlide.state === 'visible' ? zoomStyle : {}),
        }}
        draggable={false}
      />
    </div>
  );
}
