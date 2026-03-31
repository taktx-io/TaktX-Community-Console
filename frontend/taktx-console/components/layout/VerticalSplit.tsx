"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';

interface VerticalSplitProps {
  top: React.ReactNode;
  bottom: React.ReactNode | ((args: { heightPx: number }) => React.ReactNode);
  /** Initial ratio for top pane height (0.3 - 0.9). Default 0.6 */
  initialTopRatio?: number;
  /** LocalStorage key to persist ratio */
  storageKey?: string;
  /** Minimum pixel height for panes */
  minTopPx?: number;
  minBottomPx?: number;
}

/**
 * A simple vertical split container that fills available height and allows dragging the divider.
 * It persists the split ratio in localStorage and avoids SSR hydration mismatches by rendering
 * an unmeasured fallback until the client has mounted.
 */
export default function VerticalSplit({
  top,
  bottom,
  initialTopRatio = 0.6,
  storageKey = 'runway-split-top-ratio',
  minTopPx = 180,
  minBottomPx = 160,
}: Readonly<VerticalSplitProps>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [containerH, setContainerH] = useState<number>(0);
  const [topRatio, setTopRatio] = useState<number>(initialTopRatio);
  const [dragging, setDragging] = useState(false);

  // On mount, mark as mounted and try to restore saved ratio
  useEffect(() => {
    setMounted(true);
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const v = parseFloat(saved);
        if (isFinite(v) && v > 0.1 && v < 0.9) setTopRatio(v);
      }
    } catch {}
  }, [storageKey]);

  // Measure available height: viewport - container's top (no bottom margin since Content has margin:0)
  const measure = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const available = Math.max(300, vh - rect.top);
    setContainerH(available);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current?.parentElement) ro.observe(containerRef.current.parentElement);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [mounted, measure]);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top; // position within container
      const minTop = minTopPx;
      const minBottom = minBottomPx;
      const clamped = Math.min(Math.max(minTop, y), Math.max(minTop, (containerH || 0) - minBottom));
      const denom = containerH || 1;
      const ratio = clamped / denom;
      setTopRatio(ratio);
    };
    const onUp = () => {
      setDragging(false);
      try {
        window.localStorage.setItem(storageKey, String(topRatio));
      } catch {}
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp, { once: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, containerH, minBottomPx, minTopPx, storageKey, topRatio]);

  const handleH = 5; // px
  const [hovering, setHovering] = useState(false);
  const topH = Math.round((containerH || 0) * topRatio);
  const bottomH = Math.max(minBottomPx, Math.max(0, (containerH || 0) - topH - handleH));

  // Pre-mount fallback to avoid SSR/client mismatch: no fixed heights
  if (!mounted) {
    return (
      <div ref={containerRef} style={{ minHeight: 300, position: 'relative' }}>
        <div>{top}</div>
        <div style={{ height: handleH, cursor: 'row-resize', background: 'transparent', borderTop: '1px solid rgba(0,0,0,0.06)', borderBottom: '1px solid rgba(0,0,0,0.06)' }} />
        <div>{typeof bottom === 'function' ? (bottom as any)({ heightPx: 240 }) : bottom}</div>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ height: containerH, position: 'relative' }}>
      <div style={{ height: topH, overflow: 'hidden' }}>{top}</div>
      <div
        onMouseDown={startDrag}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        style={{
          height: handleH,
          cursor: 'row-resize',
          background: dragging ? 'rgba(24, 144, 255, 0.3)' : (hovering ? 'rgba(0,0,0,0.08)' : 'transparent'),
          borderTop: `1px solid ${dragging || hovering ? 'rgba(24, 144, 255, 0.2)' : 'rgba(0,0,0,0.06)'}`,
          borderBottom: `1px solid ${dragging || hovering ? 'rgba(24, 144, 255, 0.2)' : 'rgba(0,0,0,0.06)'}`,
          transition: 'background 0.15s ease, border-color 0.15s ease'
        }}
      />
      <div style={{ height: bottomH, overflow: 'hidden' }}>
        {typeof bottom === 'function' ? (bottom as any)({ heightPx: bottomH }) : bottom}
      </div>
    </div>
  );
}
