'use client';

/**
 * DmnViewer.tsx
 *
 * A React wrapper around the dmn-js library for rendering DMN files.
 * Supports the full dmn-js view lifecycle:
 *   - DRD  (Decision Requirements Diagram) — shown by default
 *   - Decision Table — navigated to by clicking a decision in the DRD
 *   - Literal Expression — navigated to by clicking a literal-expression decision
 *
 * Navigation between DRD and individual decision views is handled by the
 * built-in dmn-js navigation controls rendered inside the container.
 */

import { useEffect, useRef, useState } from 'react';
import { Empty, Spin } from 'antd';
import 'dmn-js/dist/assets/diagram-js.css';
import 'dmn-js/dist/assets/dmn-font/css/dmn-embedded.css';
import 'dmn-js/dist/assets/dmn-js-shared.css';
import 'dmn-js/dist/assets/dmn-js-drd.css';
import 'dmn-js/dist/assets/dmn-js-decision-table.css';
import 'dmn-js/dist/assets/dmn-js-literal-expression.css';

interface DmnViewerProps {
  /** Raw DMN XML string to render. */
  dmnXml: string | null;
  /** Whether to show the loading spinner. */
  loading?: boolean;
  /**
   * When set, open the matching decision view directly after import instead of
   * leaving the user on the DRD overview.
   */
  activeDecisionId?: string | null;
  /** Callback fired when the dmn-js viewer instance is ready. */
  onViewerReady?: (viewer: any) => void;
}

export default function DmnViewerComponent({
  dmnXml,
  loading = false,
  activeDecisionId,
  onViewerReady,
}: Readonly<DmnViewerProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const onViewerReadyRef = useRef(onViewerReady);
  onViewerReadyRef.current = onViewerReady;

  const [viewerReady, setViewerReady] = useState(false);

  // Create / recreate the dmn-js viewer whenever dmnXml changes.
  useEffect(() => {
    if (!containerRef.current) return;

    // Destroy any existing viewer.
    if (viewerRef.current) {
      try {
        viewerRef.current.destroy();
      } catch { /* noop */ }
      viewerRef.current = null;
      setViewerReady(false);
    }

    if (!dmnXml) return;

    // Dynamically import the navigated dmn-js viewer to enable wheel zoom and canvas panning
    // in the DRD view, mirroring the BPMN viewer behavior.
    let cancelled = false;
    import('dmn-js/lib/NavigatedViewer').then(({ default: DmnJS }) => {
      if (cancelled || !containerRef.current) return;

      const viewer = new DmnJS({ container: containerRef.current, height: '100%' });
      viewerRef.current = viewer;

      viewer
        .importXML(dmnXml)
        .then(() => {
          if (cancelled) return;
          setViewerReady(true);

          if (activeDecisionId) {
            const targetView = viewer
              .getViews()
              .find(
                (v: any) =>
                  v.id === activeDecisionId ||
                  v.element?.id === activeDecisionId
              );
            if (targetView) {
              viewer.open(targetView);
            }
          }

          if (onViewerReadyRef.current) {
            onViewerReadyRef.current(viewer);
          }
        })
        .catch((err: Error) => {
          console.error('[DmnViewer] Error importing DMN XML:', err);
        });
    });

    return () => {
      cancelled = true;
      try {
        viewerRef.current?.destroy();
      } catch { /* noop */ }
      viewerRef.current = null;
      setViewerReady(false);
    };
  }, [dmnXml, activeDecisionId]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      try {
        viewerRef.current?.destroy();
      } catch { /* noop */ }
      viewerRef.current = null;
    };
  }, []);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          minHeight: '400px',
          gap: '12px',
        }}
      >
        <Spin size="large" />
        <span style={{ fontSize: 12, color: '#999' }}>Loading DMN diagram…</span>
      </div>
    );
  }

  if (!dmnXml) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          minHeight: '400px',
          border: 'none',
          borderRadius: 0,
          padding: 0,
        }}
      >
        <Empty description="No DMN decision definition available" />
      </div>
    );
  }

  return (
    <>
      {/* Global styles that dmn-js requires for its navigation controls */}
      <style>{`
        .dmn-js-parent {
          height: 100%;
          width: 100%;
        }
        /* Ensure the DRD viewer fills available space */
        .dmn-container {
          height: 100%;
          width: 100%;
          overflow: hidden;
        }
        /* Decision table scroll container */
        .dmn-decision-table-container {
          height: 100%;
          overflow: auto;
        }
      `}</style>

      <div
        ref={containerRef}
        data-testid="dmn-viewer"
        className="dmn-container"
        style={{
          width: '100%',
          height: '100%',
          flex: 1,
          border: 'none',
          borderRadius: 0,
          backgroundColor: 'transparent',
          overflow: 'hidden',
          position: 'relative',
          padding: 0,
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      />

      {/* Invisible readiness marker used in tests */}
      {viewerReady && (
        <span data-testid="dmn-viewer-ready" style={{ display: 'none' }} />
      )}
    </>
  );
}

