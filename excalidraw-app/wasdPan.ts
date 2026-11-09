// local mod: move around the canvas with W A S D (smooth while held).
// Uses physical keys, so it works in any keyboard layout. The keys are taken
// before the editor sees them, so A/D no longer pick the arrow/diamond tools.
import { useEffect } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const SPEED = 5000; // screen pixels per second
const DIRS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  KeyS: [0, -1],
  KeyA: [1, 0],
  KeyD: [-1, 0],
};

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

export const useWasdPan = (api: ExcalidrawImperativeAPI | null) => {
  useEffect(() => {
    if (!api) {
      return;
    }
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
        dx += DIRS[code][0];
        dy += DIRS[code][1];
      });
      if (dx || dy) {
        const { scrollX, scrollY, zoom } = api.getAppState();
        const step = (SPEED * dt) / zoom.value;
        api.updateScene({
          appState: {
            scrollX: scrollX + dx * step,
            scrollY: scrollY + dy * step,
          },
        });
      }
      frame = requestAnimationFrame(tick);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !(event.code in DIRS) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        isTyping(event.target) ||
        api.getAppState().editingTextElement
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      held.add(event.code);
      if (!frame) {
        lastTime = 0;
        frame = requestAnimationFrame(tick);
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
