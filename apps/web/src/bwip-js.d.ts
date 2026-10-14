declare module 'bwip-js' {
  const bwipjs: {
    toCanvas(canvas: HTMLCanvasElement, opts: Record<string, unknown>): void;
    toSVG(opts: Record<string, unknown>): string;
  };
  export default bwipjs;
}
