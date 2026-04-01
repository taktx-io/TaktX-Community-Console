'use client';

import { useEffect, type ReactNode } from 'react';
import { unstableSetRender } from 'antd/es/config-provider/UnstableContext';
import { createRoot } from 'react-dom/client';

// Small client-side initializer to supply a React 18+ render implementation
// to Ant Design's internal unstable render hook. This avoids the console
// warning that appears when AntD checks React's render API at runtime.
export default function AntdClientSetup() {
  useEffect(() => {
    try {
      unstableSetRender((node: ReactNode, container: Element | DocumentFragment) => {
        // Ensure we have an Element to mount into (React 18 createRoot requires an Element)
        const mountEl = (container instanceof Element) ? container : (container as DocumentFragment).firstElementChild as Element | null;
        if (!mountEl) {
          // fallback: if container isn't an Element, return a noop unmount promise
          return async () => {};
        }

        // create a root for this holder and render the node into it
        const root = createRoot(mountEl);
        root.render(node);

        return async () => {
          try { root.unmount(); } catch {}
        };
      });
    } catch {
      // ignore - this is just best-effort to silence the antd warning on React 19+
    }
  }, []);

  return null;
}
