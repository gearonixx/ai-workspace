// local mod: keyboard navigation over the images on the canvas.
//   arrow keys          go to the nearest image left / below / above / right
//                       of the current one and center it, zoom untouched (animated,
//                       they no longer nudge selected elements)
//   W A S D             free fast panning while held
//   Shift + arrows      same free panning
// Physical keys, so it works in any keyboard layout. The keys are taken before
// the editor sees them, so A/D no longer pick the arrow/diamond tools.
import { useEffect } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const PAN_SPEED = 5000; // screen pixels per second (WASD)

// [x, y] direction of travel in scene coordinates
// WASD: free panning
const PAN_DIRS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  KeyS: [0, 1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
};

// arrow keys: jump between images
const DIRS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowDown: [0, 1],
  ArrowUp: [0, -1],
  ArrowRight: [1, 0],
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
// across the direction counts double, so up/down stay in the same column and
// left/right in the same row
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
    // while a jump animation runs the view is still on its way to the image
    let lastJumpAt = 0;

    // --- WASD / Shift + arrows: free panning while held ----------------------------
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

    // --- arrows: jump to the next image --------------------------------------
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
        (performance.now() - lastJumpAt < 600 ||
          Math.hypot(current.cx - center.x, current.cy - center.y) < 50);
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
      lastJumpAt = performance.now();
      // center the image, keep the zoom the user set
      api.setViewport({
        target: el,
        fit: "none",
        animation: true,
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
