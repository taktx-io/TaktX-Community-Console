import { useState, useRef, useEffect } from 'react';

/**
 * Parameters for detail pane resize hook
 */
interface UseDetailPaneResizeParams {
  /** Ref to the container element (for measuring available width) */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Optional dependencies that trigger reinitialization of width */
  dependencies?: any[];
}

/**
 * Return type for detail pane resize hook
 */
interface UseDetailPaneResizeReturn {
  /** Current detail pane width in pixels */
  detailWidthPx: number | null;
  /** Mouse down handler to start drag resize */
  onStartDrag: (clientX: number) => void;
  /** Keyboard handler for accessibility (arrow keys to resize) */
  onHandleKeyDown: (ev: React.KeyboardEvent) => void;
}

/**
 * Custom hook to manage resizable detail pane width
 *
 * Features:
 * - Persists width to localStorage
 * - Responsive: clamps width when container resizes
 * - Mouse drag to resize
 * - Keyboard accessibility (arrow keys, home, end)
 * - Prevents text selection during drag
 * - RAF throttling for smooth performance
 *
 * @param params - Configuration object
 * @returns Object with width state and event handlers
 */
export function useDetailPaneResize({
  containerRef,
  dependencies = [],
}: UseDetailPaneResizeParams): UseDetailPaneResizeReturn {
  const DETAIL_WIDTH_KEY = 'runway-detail-width-px';
  const detailMinPx = 260;
  const detailMaxRatio = 0.95; // cannot exceed 95% of container width

  const [detailWidthPx, setDetailWidthPx] = useState<number | null>(null);
  const draggingRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  // Initialize detail width from localStorage or default when container size available
  useEffect(() => {
    const init = () => {
      try {
        // Use container width if available, otherwise fall back to document width
        const containerWidth = containerRef.current?.getBoundingClientRect().width;
        const availableWidth = containerWidth && containerWidth > 0
          ? containerWidth
          : (typeof document !== 'undefined' && document.documentElement)
          ? document.documentElement.clientWidth
          : 1200;

        console.log('[useDetailPaneResize] Initializing width', {
          containerWidth,
          availableWidth,
          containerExists: !!containerRef.current
        });

        const saved = Number(localStorage.getItem(DETAIL_WIDTH_KEY));

        // Validate saved value: if it's way larger than the container width, it was likely
        // calculated from the old buggy code using full window width. Also reset if it's
        // unreasonably small (less than 50% when we want 75% default).
        const isInvalidSavedValue = saved > 0 && containerWidth && (
          saved > containerWidth * 1.2 || // Too large
          saved < containerWidth * 0.5   // Too small
        );

        if (saved && !Number.isNaN(saved) && saved > 0 && !isInvalidSavedValue) {
          const clamped = Math.max(detailMinPx, Math.min(availableWidth * detailMaxRatio, saved));
          console.log('[useDetailPaneResize] Using saved width', {
            saved,
            clamped,
            maxAllowed: availableWidth * detailMaxRatio
          });
          setDetailWidthPx(clamped);
        } else {
          if (isInvalidSavedValue) {
            console.log('[useDetailPaneResize] Detected invalid saved value (likely from old bug), resetting', {
              saved,
              containerWidth,
              ratio: saved / (containerWidth || 1)
            });
          }
          // default to 75% if no saved value
          const defaultWidth = Math.round(availableWidth * 0.75);
          console.log('[useDetailPaneResize] Using default width (75%)', {
            defaultWidth,
            availableWidth
          });
          setDetailWidthPx(defaultWidth);
          // Save the default so it persists
          try {
            localStorage.setItem(DETAIL_WIDTH_KEY, String(defaultWidth));
          } catch {
            // Silently fail
          }
        }
      } catch (e) {
        console.error('[useDetailPaneResize] Error during initialization', e);
      }
    };

    // Only initialize if detailWidthPx is not set yet
    // This prevents resetting the width when dependencies change
    if (detailWidthPx === null) {
      let retryCount = 0;
      const maxRetries = 20; // Limit retries to prevent infinite loop

      // Check if container has dimensions, if not, retry after a short delay
      const checkAndInit = () => {
        const containerWidth = containerRef.current?.getBoundingClientRect().width;
        if (containerWidth && containerWidth > 0) {
          // Container is ready, initialize
          init();
        } else if (retryCount < maxRetries) {
          // Container not ready yet, retry after animation frame
          retryCount++;
          if (retryCount <= 3) {
            // Only log first few retries to avoid spam
            console.log('[useDetailPaneResize] Container not ready, will retry', { retryCount });
          }
          requestAnimationFrame(checkAndInit);
        } else {
          // Max retries reached, initialize with fallback
          console.warn('[useDetailPaneResize] Container not ready after max retries, using fallback width');
          init(); // Will use fallback document width
        }
      };

      // run after paint
      const id = requestAnimationFrame(checkAndInit);
      return () => cancelAnimationFrame(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailWidthPx, ...dependencies]);

  // Watch container size and clamp detail panel width when it changes
  useEffect(() => {
    if (!containerRef.current || detailWidthPx === null) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const availableWidth = entry.contentRect.width;
        const maxWidth = availableWidth * detailMaxRatio;

        // If detail panel is wider than available space, clamp it
        if (detailWidthPx > maxWidth) {
          console.log('[useDetailPaneResize] Clamping detail panel width', {
            current: detailWidthPx,
            max: maxWidth,
            available: availableWidth
          });
          setDetailWidthPx(maxWidth);
          try {
            localStorage.setItem(DETAIL_WIDTH_KEY, String(maxWidth));
          } catch {
            // Silently fail
          }
        }
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [detailWidthPx, containerRef]);

  // Mouse drag handler to start resize
  const onStartDrag = (clientX: number) => {
    const root = containerRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    // Use saved value or default to 75%
    const saved = Number(localStorage.getItem(DETAIL_WIDTH_KEY));
    const defaultWidth = saved && !Number.isNaN(saved) && saved > 0
      ? saved
      : Math.round(rect.width * 0.75);
    const currentWidth = detailWidthPx ?? defaultWidth;
    draggingRef.current = { startX: clientX, startWidth: currentWidth };

    // Prevent text selection and native drag behaviour while resizing
    try {
      const body = document.body as HTMLBodyElement & { dataset: any };
      body.dataset._prevUserSelect = (body.style as any).userSelect || '';
      body.dataset._prevWebkitUserSelect = (body.style as any).webkitUserSelect || '';
      body.dataset._prevMozUserSelect = (body.style as any).MozUserSelect || '';
      (body.style as any).userSelect = 'none';
      (body.style as any).webkitUserSelect = 'none';
      (body.style as any).MozUserSelect = 'none';
    } catch {
      // Silently fail
    }

    const preventSelect = (ev: Event) => {
      try {
        ev.preventDefault();
      } catch {
        // Silently fail
      }
    };

    // Store on draggingRef so onUp can access it to remove listeners
    (draggingRef as any).preventSelect = preventSelect;
    document.addEventListener('selectstart', preventSelect);
    document.addEventListener('dragstart', preventSelect);

    // Mouse move handler (RAF throttled)
    const onMove = (ev: MouseEvent) => {
      const latestX = ev.clientX;
      if (rafRef.current != null) return; // Already scheduled

      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const r = draggingRef.current;
        if (!r || !root) return;

        const rootRect = root.getBoundingClientRect();
        // Panel is right-aligned, so newWidth = rootRect.right - clientX
        const candidate = Math.round(rootRect.right - latestX);
        const max = Math.floor(rootRect.width * detailMaxRatio);
        const next = Math.max(detailMinPx, Math.min(max, candidate));
        setDetailWidthPx(next);
      });
    };

    // Mouse up handler to end resize
    const onUp = () => {
      // Cancel pending RAF
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      // Persist final width
      const r = draggingRef.current;
      if (r) {
        try {
          if (detailWidthPx) {
            localStorage.setItem(DETAIL_WIDTH_KEY, String(detailWidthPx));
          }
        } catch {
          // Silently fail
        }
      }

      // Restore text selection
      try {
        const body = document.body as HTMLBodyElement & { dataset: any };
        const prev = body.dataset && body.dataset._prevUserSelect;
        const prevWeb = body.dataset && body.dataset._prevWebkitUserSelect;
        const prevMoz = body.dataset && body.dataset._prevMozUserSelect;
        if (typeof prev !== 'undefined') (body.style as any).userSelect = prev;
        else (body.style as any).userSelect = '';
        if (typeof prevWeb !== 'undefined') (body.style as any).webkitUserSelect = prevWeb;
        else (body.style as any).webkitUserSelect = '';
        if (typeof prevMoz !== 'undefined') (body.style as any).MozUserSelect = prevMoz;
        else (body.style as any).MozUserSelect = '';
      } catch {
        // Silently fail
      }

      // Remove selection prevention listeners
      try {
        const prevent = (draggingRef as any).preventSelect as EventListener | undefined;
        if (prevent) {
          document.removeEventListener('selectstart', prevent);
          document.removeEventListener('dragstart', prevent);
        }
      } catch {
        // Silently fail
      }

      draggingRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // Keyboard handler for accessibility
  const onHandleKeyDown = (ev: React.KeyboardEvent) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const max = Math.floor(rect.width * detailMaxRatio);
    // Use saved value or default to 75%
    const saved = Number(localStorage.getItem(DETAIL_WIDTH_KEY));
    const defaultWidth = saved && !Number.isNaN(saved) && saved > 0
      ? saved
      : Math.round(rect.width * 0.75);
    const cur = detailWidthPx ?? defaultWidth;
    let next = cur;

    if (ev.key === 'ArrowLeft') {
      next = Math.min(max, Math.max(detailMinPx, cur - 16));
    } else if (ev.key === 'ArrowRight') {
      next = Math.min(max, Math.max(detailMinPx, cur + 16));
    } else if (ev.key === 'Home') {
      next = detailMinPx;
    } else if (ev.key === 'End') {
      next = max;
    }

    if (next !== cur) {
      ev.preventDefault();
      setDetailWidthPx(next);
      // Persist to localStorage
      try {
        localStorage.setItem(DETAIL_WIDTH_KEY, String(next));
      } catch {
        // Silently fail
      }
    }
  };

  return {
    detailWidthPx,
    onStartDrag,
    onHandleKeyDown,
  };
}

