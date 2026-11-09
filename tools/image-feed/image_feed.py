#!/usr/bin/env python3
"""Local image feed for the canvas.

Watches ~/claude-images/*/claude/ (images that Claude Code sessions save) and
streams new ones to the canvas page via Server-Sent Events. Listens on
127.0.0.1 only; images never leave the machine.

  GET /events?since=<ms>  SSE: one "image" event per new file (mtime > since)
  GET /file?p=<relpath>   the image bytes (path relative to the root)
"""

import json
import mimetypes
import os
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.realpath(os.path.expanduser(os.environ.get("IMAGE_FEED_ROOT", "~/claude-images")))
PORT = int(os.environ.get("IMAGE_FEED_PORT", "8977"))
EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}
ALLOWED_ORIGINS = {
    "https://drw0.vercel.app",
    "https://gxcnv.vercel.app",
    "https://cnvs-woad.vercel.app",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:4173",
}
SETTLE_SECONDS = 1.5  # skip files still being written


def scan():
    """[(mtime_ms, relpath)] of all session-made images."""
    out = []
    try:
        topics = os.scandir(ROOT)
    except FileNotFoundError:
        return out
    for topic in topics:
        if not topic.is_dir():
            continue
        cdir = os.path.join(topic.path, "claude")
        try:
            entries = os.scandir(cdir)
        except (FileNotFoundError, NotADirectoryError):
            continue
        for e in entries:
            if not e.is_file() or os.path.splitext(e.name)[1].lower() not in EXTS:
                continue
            try:
                st = e.stat()
            except FileNotFoundError:
                continue
            if time.time() - st.st_mtime < SETTLE_SECONDS or st.st_size == 0:
                continue
            out.append((int(st.st_mtime * 1000), os.path.relpath(e.path, ROOT)))
    out.sort()
    return out


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass

    def cors(self):
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Private-Network", "true")

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header("Access-Control-Allow-Methods", "GET")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(url.query)
        if url.path == "/events":
            return self.events(int((q.get("since") or ["0"])[0] or 0))
        if url.path == "/file":
            return self.file((q.get("p") or [""])[0])
        if url.path == "/health":
            body = b"ok"
            self.send_response(200)
            self.cors()
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_error(404)

    def file(self, rel):
        path = os.path.realpath(os.path.join(ROOT, rel))
        if not path.startswith(ROOT + os.sep) or not os.path.isfile(path) \
                or os.path.splitext(path)[1].lower() not in EXTS:
            return self.send_error(404)
        with open(path, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.cors()
        self.send_header("Content-Type", mimetypes.guess_type(path)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def events(self, since):
        self.send_response(200)
        self.cors()
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        sent = set()
        last_ping = 0.0
        try:
            while True:
                for mtime, rel in scan():
                    if mtime <= since or rel in sent:
                        continue
                    sent.add(rel)
                    payload = json.dumps({"path": rel, "mtime": mtime,
                                          "name": os.path.basename(rel)})
                    self.wfile.write(f"event: image\ndata: {payload}\n\n".encode())
                    self.wfile.flush()
                if time.time() - last_ping > 15:
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
                    last_ping = time.time()
                time.sleep(1)
        except (BrokenPipeError, ConnectionResetError):
            return


if __name__ == "__main__":
    ThreadingHTTPServer.daemon_threads = True
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
