# canvas (private fork of Excalidraw)

Personal, minimal-UI build of [Excalidraw](https://github.com/excalidraw/excalidraw) (MIT, see LICENSE).

## Changes vs upstream
- Top shapes toolbar, its hint, hamburger menu, sidebar toggle hidden.
- Style panel shows only Stroke and Background colors.
- Excalidraw+ banner, Share button, encryption badge, zoom / undo / help buttons hidden.
- No welcome screen, no logo favicon, tab title "canvas".
- Ctrl+Shift+D = reset canvas (Ctrl+Z undoes it). Ctrl+Shift+S = Save to... (upstream).

Tools stay on the keyboard: V select, H hand, R rectangle, D diamond, O ellipse,
A arrow, L line, P pencil, T text, E eraser; Ctrl+O open, Ctrl+Shift+E export image,
Ctrl+/ command palette, Ctrl+F find, ? help.

## Run
    yarn install
    yarn start        # http://localhost:3001

## Sync with upstream
    git fetch upstream && git merge upstream/master
