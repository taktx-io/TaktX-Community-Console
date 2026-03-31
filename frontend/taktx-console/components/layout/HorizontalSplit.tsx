"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';

interface HorizontalSplitProps {
  left: React.ReactNode;
  right: React.ReactNode;
  /** Initial ratio for left pane width (0.2 - 0.8). Default 0.5 */
  initialLeftRatio?: number;
  /** LocalStorage key to persist ratio */
  storageKey?: string;
  /** Minimum pixel width for panes */
  minLeftPx?: number;
  minRightPx?: number;
  /** Whether the left panel is collapsed */
  collapsed?: boolean;
  /** Width in pixels when collapsed */
  collapsedWidthPx?: number;
}

/**
 * A horizontal split container that fills available width and allows dragging the divider.
 * Persists the split ratio in localStorage.
 */
export default function HorizontalSplit({
  left,
  right,
  initialLeftRatio = 0.5,
  storageKey = 'horizontal-split-ratio',
  minLeftPx = 200,
  minRightPx = 200,
  collapsed = false,
  collapsedWidthPx = 48,
}: Readonly<HorizontalSplitProps>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [leftRatio, setLeftRatio] = useState<number>(initialLeftRatio);
  const [dragging, setDragging] = useState(false);

  // On mount, restore saved ratio
  useEffect(() => {
    setMounted(true);
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const v = parseFloat(saved);
        if (isFinite(v) && v > 0.2 && v < 0.8) setLeftRatio(v);
      }
    } catch {}
  }, [storageKey]);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const containerW = rect.width;
      const minLeft = minLeftPx;
      const minRight = minRightPx;
      const clamped = Math.min(Math.max(minLeft, x), Math.max(minLeft, containerW - minRight));
      const ratio = clamped / containerW;
      setLeftRatio(ratio);
    };
    const onUp = () => {
      setDragging(false);
      try {
        window.localStorage.setItem(storageKey, String(leftRatio));
      } catch {}
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp, { once: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, minLeftPx, minRightPx, storageKey, leftRatio]);

  const handleW = 5; // px
  const [hovering, setHovering] = useState(false);

  // Calculate the actual left width based on collapsed state
  const leftWidth = collapsed ? `${collapsedWidthPx}px` : `${leftRatio * 100}%`;

  return (
    <div ref={containerRef} style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: `0 0 ${leftWidth}`, overflow: 'hidden', transition: collapsed ? 'flex-basis 0.2s ease-in-out' : 'none' }}>{left}</div>
      <div
        onMouseDown={collapsed ? undefined : startDrag}
        onMouseEnter={() => !collapsed && setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        style={{
          width: handleW,
          cursor: collapsed ? 'default' : 'col-resize',
          background: dragging ? 'rgba(24, 144, 255, 0.3)' : (hovering ? 'rgba(0,0,0,0.08)' : 'transparent'),
          borderLeft: `1px solid ${dragging || hovering ? 'rgba(24, 144, 255, 0.2)' : 'rgba(0,0,0,0.06)'}`,
          borderRight: `1px solid ${dragging || hovering ? 'rgba(24, 144, 255, 0.2)' : 'rgba(0,0,0,0.06)'}`,
          flexShrink: 0,
          transition: 'background 0.15s ease, border-color 0.15s ease',
          pointerEvents: collapsed ? 'none' : 'auto',
        }}
      />
      <div style={{ flex: 1, overflow: 'hidden' }}>{right}</div>
    </div>
  );
}

