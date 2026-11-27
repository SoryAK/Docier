/** A stand-in canvas: the test page has none. It records each photo's turn and flips. */
export function fakeCanvas() {
  const drawn: Array<{ rotate: number; scale: [number, number] }> = [];
  const realBitmap = globalThis.createImageBitmap;
  const realContext = HTMLCanvasElement.prototype.getContext;
  const realData = HTMLCanvasElement.prototype.toDataURL;
  let closed = 0;
  globalThis.createImageBitmap = (async () => ({ width: 1200, height: 800, close: () => (closed += 1) })) as never;
  HTMLCanvasElement.prototype.getContext = function getContext() {
    const step = { rotate: 0, scale: [1, 1] as [number, number] };
    return {
      fillStyle: "",
      fillRect() {},
      translate() {},
      rotate(angle: number) {
        step.rotate = Math.round((angle * 180) / Math.PI);
      },
      scale(x: number, y: number) {
        step.scale = [x, y];
      },
      drawImage() {
        drawn.push({ ...step });
      },
    } as never;
  } as never;
  HTMLCanvasElement.prototype.toDataURL = () => "data:image/jpeg;base64,U0hSVU5L";
  return {
    drawn,
    closed: () => closed,
    restore() {
      globalThis.createImageBitmap = realBitmap;
      HTMLCanvasElement.prototype.getContext = realContext;
      HTMLCanvasElement.prototype.toDataURL = realData;
    },
  };
}
