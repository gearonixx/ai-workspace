// local mod: auto-insert images that Claude Code sessions save on this
// machine. A tiny local server (tools/image-feed/image_feed.py, 127.0.0.1
// only) streams new files from ~/claude-images/*/claude/; each one is placed
// below the current drawing and the view moves to it.
import { useEffect } from "react";

import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
} from "@excalidraw/excalidraw";

import type { FileId } from "@excalidraw/element/types";
import type {
  BinaryFileData,
  DataURL,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

const FEED = "http://127.0.0.1:8977";
const LAST_KEY = "canvas:image-feed:last";
const MAX_WIDTH = 900;
const GAP = 60;

type FeedImage = { path: string; mtime: number; name: string };

const readLast = (): number => {
  try {
    const v = Number(localStorage.getItem(LAST_KEY));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
};

const writeLast = (v: number) => {
  try {
    localStorage.setItem(LAST_KEY, String(v));
  } catch {}
};

const blobToDataURL = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

const naturalSize = (src: string) =>
  new Promise<{ w: number; h: number }>((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({ w: img.naturalWidth || 400, h: img.naturalHeight || 300 });
    img.onerror = () => resolve({ w: 400, h: 300 });
    img.src = src;
  });

const insertImage = async (api: ExcalidrawImperativeAPI, item: FeedImage) => {
  const res = await fetch(`${FEED}/file?p=${encodeURIComponent(item.path)}`);
  if (!res.ok) {
    return;
  }
  const blob = await res.blob();
  const dataURL = await blobToDataURL(blob);
  const { w, h } = await naturalSize(dataURL);
  const scale = Math.min(1, MAX_WIDTH / w);
  const width = Math.round(w * scale);
  const height = Math.round(h * scale);

  // below everything that is already on the canvas, left-aligned with it
  const existing = api.getSceneElements().filter((el) => !el.isDeleted);
  let x = 0;
  let y = 0;
  if (existing.length) {
    x = Math.min(...existing.map((el) => el.x));
    y = Math.max(...existing.map((el) => el.y + el.height)) + GAP;
  }

  const fileId = `feed-${item.mtime}-${item.name}`.slice(0, 120) as FileId;
  const file: BinaryFileData = {
    id: fileId,
    dataURL: dataURL as DataURL,
    mimeType: (blob.type || "image/png") as BinaryFileData["mimeType"],
    created: Date.now(),
  };
  api.addFiles([file]);

  const [imageEl] = convertToExcalidrawElements([
    { type: "image", fileId, x, y, width, height, status: "saved" },
  ]);
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), imageEl],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  api.setViewport({ target: imageEl, fit: "scale-down", animation: false });
};

// connect to the local feed; reconnect every 5 s while it is down, always
// asking only for images newer than the last one inserted
const startFeed = (api: ExcalidrawImperativeAPI): (() => void) => {
  let stopped = false;
  let es: EventSource | null = null;
  let timer = 0;
  let queue = Promise.resolve();

  const open = () => {
    if (stopped) {
      return;
    }
    es = new EventSource(`${FEED}/events?since=${readLast()}`);
    es.addEventListener("image", (ev) => {
      let item: FeedImage;
      try {
        item = JSON.parse((ev as MessageEvent).data);
      } catch {
        return;
      }
      queue = queue
        .then(() => insertImage(api, item))
        .then(() => {
          if (item.mtime > readLast()) {
            writeLast(item.mtime);
          }
        })
        .catch(() => {});
    });
    es.onerror = () => {
      es?.close();
      timer = window.setTimeout(open, 5000);
    };
  };

  open();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    es?.close();
  };
};

export const useImageFeed = (api: ExcalidrawImperativeAPI | null) => {
  useEffect(() => {
    if (!api || typeof EventSource === "undefined") {
      return;
    }
    // first run ever: only images made from now on
    if (!readLast()) {
      writeLast(Date.now());
    }
    return startFeed(api);
  }, [api]);
};
