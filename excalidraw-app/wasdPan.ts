// local mod: W A S D jump between the images on the canvas.
//   W / A / S / D       go to the nearest image above / left / below / right
//                       of the current one and fit it to the screen (instant)
//   H J K L             free fast panning while held (vim: left/down/up/right)
//   Shift + W A S D     same free panning
// Physical keys, so it works in any keyboard layout. The keys are taken before
// the editor sees them, so A/D no longer pick the arrow/diamond tools.
import { useEffect } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const PAN_SPEED = 5000; // screen pixels per second (Shift + WASD)
// the area shown around an image on a jump, relative to the image size
const VIEW_MARGIN = 1.5;

// [x, y] direction of travel in scene coordinates
// vim keys for free panning
const PAN_DIRS: Record<string, [number, number]> = {
  KeyH: [-1, 0],
  KeyJ: [0, 1],
  KeyK: [0, -1],
  KeyL: [1, 0],
};

const DIRS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  KeyS: [0, 1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
};

type Box = { id: string; cx: number; cy: number };

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return (
    !!el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" ||
      el.isContentEditable)
  );
};

const viewportCenter = (api: ExcalidrawImperativeAPI) => {
  const { scrollX, scrollY, zoom, width, height } = api.getAppState();
  return {
    x: -scrollX + width / 2 / zoom.value,
    y: -scrollY + height / 2 / zoom.value,
  };
};

const imageBoxes = (api: ExcalidrawImperativeAPI): Box[] =>
  api
    .getSceneElements()
    .filter((el) => el.type === "image" && !el.isDeleted)
    .map((el) => ({
      id: el.id,
      cx: el.x + el.width / 2,
      cy: el.y + el.height / 2,
    }));

// the nearest image whose center lies in the pressed direction; distance
// across the direction counts double, so W/S stay in the same column and
// A/D in the same row
const pickNext = (
  from: { x: number; y: number },
  dir: [number, number],
  boxes: Box[],
  skipId: string | null,
) => {
  let best: Box | null = null;
  let bestScore = Infinity;
  for (const b of boxes) {
    if (b.id === skipId) {
      continue;
    }
    const dx = b.cx - from.x;
    const dy = b.cy - from.y;
    const along = dx * dir[0] + dy * dir[1];
    if (along <= 1) {
      continue;
    }
    const across = Math.abs(dx * dir[1] - dy * dir[0]);
    const score = along + 2 * across;
    if (score < bestScore) {
      bestScore = score;
      best = b;
    }
  }
  return best;
};

export const useWasdPan = (api: ExcalidrawImperativeAPI | null) => {
  useEffect(() => {
    if (!api) {
      return;
    }
    let currentId: string | null = null;

    // --- Shift + WASD: free panning while held ----------------------------
    const held = new Set<string>();
    let frame = 0;
    let lastTime = 0;
    const tick = (time: number) => {
      if (!held.size) {
        frame = 0;
        return;
      }
      const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 1 / 60;
      lastTime = time;
      let dx = 0;
      let dy = 0;
      held.forEach((code) => {
        const d = DIRS[code] || PAN_DIRS[code];
        dx += d[0];
        dy += d[1];
      });
      if (dx || dy) {
        const { scrollX, scrollY, zoom } = api.getAppState();
        const step = (PAN_SPEED * dt) / zoom.value;
        // moving the view right means scrolling the scene left
        api.updateScene({
          appState: {
            scrollX: scrollX - dx * step,
            scrollY: scrollY - dy * step,
          },
        });
      }
      frame = requestAnimationFrame(tick);
    };

    // --- WASD: jump to the next image --------------------------------------
    const jump = (code: string) => {
      const boxes = imageBoxes(api);
      if (!boxes.length) {
        return;
      }
      const center = viewportCenter(api);
      const current = boxes.find((b) => b.id === currentId);
      // start from the image we jumped to last, unless the view moved away
      const onCurrent =
        !!current &&
        Math.hypot(current.cx - center.x, current.cy - center.y) < 50;
      const from = onCurrent ? { x: current!.cx, y: current!.cy } : center;
      const next = pickNext(
        from,
        DIRS[code],
        boxes,
        onCurrent ? currentId : null,
      );
      if (!next) {
        return;
      }
      const el = api.getSceneElements().find((e) => e.id === next.id);
      if (!el) {
        return;
      }
      currentId = next.id;
      // fit the image with a margin around it (it takes ~2/3 of the screen),
      // not edge to edge
      const w = el.width * VIEW_MARGIN;
      const h = el.height * VIEW_MARGIN;
      api.setViewport({
        target: {
          x: el.x + el.width / 2 - w / 2,
          y: el.y + el.height / 2 - h / 2,
          width: w,
          height: h,
        },
        fit: "contain",
        animation: false,
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !(event.code in DIRS || event.code in PAN_DIRS) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isTyping(event.target) ||
        api.getAppState().editingTextElement
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey || event.code in PAN_DIRS) {
        held.add(event.code);
        if (!frame) {
          lastTime = 0;
          frame = requestAnimationFrame(tick);
        }
        return;
      }
      if (!event.repeat) {
        jump(event.code);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (held.delete(event.code)) {
        event.stopPropagation();
      }
    };

    const clear = () => held.clear();

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", clear);
      cancelAnimationFrame(frame);
    };
  }, [api]);
};
