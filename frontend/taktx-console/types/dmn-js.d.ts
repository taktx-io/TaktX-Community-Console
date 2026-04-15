/**
 * Minimal TypeScript declarations for dmn-js (no official @types package available).
 * Extended as needed.
 */
declare module 'dmn-js' {
  interface DmnJSOptions {
    container: HTMLElement;
    height?: string | number;
    width?: string | number;
    [key: string]: any;
  }

  interface DmnView {
    id: string;
    type: 'drd' | 'decisionTable' | 'literalExpression' | 'boxedExpression';
    element?: any;
  }

  class DmnJS {
    constructor(options: DmnJSOptions);
    importXML(xml: string): Promise<{ warnings: any[] }>;
    open(view: DmnView): void;
    getViews(): DmnView[];
    getActiveView(): DmnView | null;
    getActiveViewer(): any;
    on(event: string, handler: (...args: any[]) => void): void;
    off(event: string, handler: (...args: any[]) => void): void;
    destroy(): void;
  }

  export default DmnJS;
}

declare module 'dmn-js/lib/NavigatedViewer' {
  import DmnJS from 'dmn-js';

  export default DmnJS;
}

