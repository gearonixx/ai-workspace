# canvas (private fork of Excalidraw)

Personal, minimal-UI build of [Excalidraw](https://github.com/excalidraw/excalidraw) (MIT, see LICENSE).

## Changes vs upstream
- Top shapes toolbar, its hint, hamburger menu, sidebar toggle hidden.
- Style panel: stroke color swatches + stroke width, no headings, no card background, no full color picker button.
- Service worker self-destroys: every deploy shows at once.
- Excalidraw+ banner, Share button, encryption badge, zoom / undo / help buttons hidden.
- No welcome screen, no logo favicon, tab title "ai-workspace", no dev error badge.
- Right-click menu has one item: "Copy Image" (copy to clipboard as PNG), no shortcut hints.
- Ctrl + / Ctrl - zoom steps doubled.
- Ctrl+Shift+D = reset canvas (Ctrl+Z undoes it). Ctrl+Shift+S = Save to... (upstream).

Tools stay on the keyboard: V select, H hand, R rectangle, D diamond, O ellipse,
A arrow, L line, P pencil, T text, E eraser; Ctrl+O open, Ctrl+Shift+E export image,
Ctrl+/ command palette, Ctrl+F find, ? help.

## Run
    yarn install
    yarn start        # http://localhost:3001

## Sync with upstream
    git fetch upstream && git merge upstream/master

## Deploy (Vercel project `cnvs`, main URL https://drw0.vercel.app)
    cd excalidraw-app && npx cross-env VITE_APP_ENABLE_TRACKING=false vite build
    # copy build/ into an empty dir with .vercel/ (project cnvs) + a minimal vercel.json, then:
    npx vercel@latest deploy --prod --yes --scope gearonixx
    # never leave .env.local (vercel link writes an OIDC token there) in the deploy dir

## Image feed (images from Claude Code sessions appear on the canvas)
`tools/image-feed/image_feed.py` (user service `canvas-image-feed`, 127.0.0.1:8977 only) watches
`~/claude-images/*/claude/` and streams new files over SSE. `excalidraw-app/imageFeed.ts` connects from the
page, inserts each new image below the drawing and moves the view to it. Only images newer than the last
inserted one; nothing leaves the machine.

    systemctl --user enable --now canvas-image-feed   # unit file: tools/image-feed/canvas-image-feed.service
