#!/usr/bin/env python3
"""mac-remote : pilote un Mac depuis le navigateur d'un iPhone / iPad.

Le Mac lance ce script ; le téléphone ouvre l'URL affichée dans Safari.
- vidéo  : capture d'écran -> WebRTC (aiortc)
- entrée : WebSocket -> événements souris/clavier injectés via Quartz

    python3 server.py              # sur le Mac
    python3 server.py --dry-run    # test sans Mac : mire + entrées journalisées
"""
import argparse
import asyncio
import fractions
import json
import logging
import secrets
import socket
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from aiohttp import WSMsgType, web
from aiortc import RTCConfiguration, RTCPeerConnection, RTCSessionDescription
from aiortc.codecs import h264 as _h264, vpx as _vpx
from aiortc.mediastreams import VideoStreamTrack
from aiortc.rtcrtpsender import RTCRtpSender
from av import VideoFrame

log = logging.getLogger("mac-remote")
STATIC = Path(__file__).parent / "static"
TOKEN_FILE = Path.home() / ".mac-remote-token"

# ---------------------------------------------------------------- entrées

SPECIAL_KEYS = {
    "Enter": 36, "Tab": 48, "Space": 49, "Backspace": 51, "Escape": 53,
    "ArrowLeft": 123, "ArrowRight": 124, "ArrowDown": 125, "ArrowUp": 126,
}
# Disposition US, utilisée seulement si la disposition active est illisible.
US_KEYCODES = {
    "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8,
    "v": 9, "b": 11, "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17,
    "1": 18, "2": 19, "3": 20, "4": 21, "6": 22, "5": 23, "=": 24, "9": 25,
    "7": 26, "-": 27, "8": 28, "0": 29, "]": 30, "o": 31, "u": 32, "[": 33,
    "i": 34, "p": 35, "l": 37, "j": 38, "'": 39, "k": 40, ";": 41, "\\": 42,
    ",": 43, "/": 44, "n": 45, "m": 46, ".": 47, "`": 50,
}
DOUBLE_CLICK_S = 0.4
DOUBLE_CLICK_PX = 6


class DummyInput:
    """Remplace Quartz hors macOS : journalise et simule un curseur."""

    def __init__(self):
        self.w, self.h = 1440.0, 900.0
        self.x, self.y = self.w / 2, self.h / 2
        self.events = []

    def _log(self, *a):
        self.events.append(a)
        log.info("entrée %s", a)

    def cursor(self):
        return self.x / self.w, self.y / self.h

    def move(self, dx, dy):
        self.x = min(max(self.x + dx, 0), self.w - 1)
        self.y = min(max(self.y + dy, 0), self.h - 1)

    def move_to(self, nx, ny):
        self.x, self.y = nx * self.w, ny * self.h

    def button(self, button, down):
        self._log("button", button, "down" if down else "up")

    def scroll(self, dx, dy):
        self._log("scroll", round(dx), round(dy))

    def key(self, key, mods):
        self._log("key", key, sorted(mods))


class QuartzInput:
    """Injection souris/clavier sur macOS (permission Accessibilité requise)."""

    def __init__(self):
        import Quartz as Q

        self.Q = Q
        self.down = set()
        self.last_click = (0.0, 0.0, 0.0, None)  # t, x, y, bouton
        self.click_state = 1
        self.flags = {
            "cmd": Q.kCGEventFlagMaskCommand, "ctrl": Q.kCGEventFlagMaskControl,
            "alt": Q.kCGEventFlagMaskAlternate, "shift": Q.kCGEventFlagMaskShift,
        }
        self.keycodes = self._read_layout() or dict(US_KEYCODES)

    def _read_layout(self):
        """Caractère -> code de touche pour la disposition active (AZERTY, etc.)."""
        Q = self.Q
        table = {}
        try:
            for code in range(0, 51):
                if code in SPECIAL_KEYS.values():
                    continue
                ev = Q.CGEventCreateKeyboardEvent(None, code, True)
                Q.CGEventSetFlags(ev, 0)
                _, s = Q.CGEventKeyboardGetUnicodeString(ev, 4, None, None)
                if s and s.strip():
                    table.setdefault(s.lower(), code)
        except Exception as e:  # noqa: BLE001
            log.warning("disposition clavier illisible (%s) : repli sur QWERTY US", e)
            return None
        row = "".join(c for c, k in sorted(table.items(), key=lambda i: i[1])
                      if k in (12, 13, 14, 15, 17, 16))
        log.info("disposition clavier détectée : %d touches (rangée du haut : %s)",
                 len(table), row)
        return table if len(table) > 20 else None

    def _bounds(self):
        b = self.Q.CGDisplayBounds(self.Q.CGMainDisplayID())
        return b.origin.x, b.origin.y, b.size.width, b.size.height

    def _pos(self):
        p = self.Q.CGEventGetLocation(self.Q.CGEventCreate(None))
        return p.x, p.y

    def cursor(self):
        ox, oy, w, h = self._bounds()
        x, y = self._pos()
        return (x - ox) / w, (y - oy) / h

    def _post_mouse(self, kind, x, y, button=0):
        Q = self.Q
        ev = Q.CGEventCreateMouseEvent(None, kind, (x, y), button)
        Q.CGEventSetIntegerValueField(ev, Q.kCGMouseEventClickState, self.click_state)
        Q.CGEventPost(Q.kCGHIDEventTap, ev)

    def _goto(self, x, y):
        Q = self.Q
        ox, oy, w, h = self._bounds()
        x = min(max(x, ox), ox + w - 1)
        y = min(max(y, oy), oy + h - 1)
        if "left" in self.down:
            self._post_mouse(Q.kCGEventLeftMouseDragged, x, y, Q.kCGMouseButtonLeft)
        elif "right" in self.down:
            self._post_mouse(Q.kCGEventRightMouseDragged, x, y, Q.kCGMouseButtonRight)
        else:
            self._post_mouse(Q.kCGEventMouseMoved, x, y)

    def move(self, dx, dy):
        x, y = self._pos()
        self._goto(x + dx, y + dy)

    def move_to(self, nx, ny):
        ox, oy, w, h = self._bounds()
        self._goto(ox + nx * w, oy + ny * h)

    def button(self, button, down):
        Q = self.Q
        x, y = self._pos()
        left = button == "left"
        if down:
            t, lx, ly, lb = self.last_click
            near = abs(x - lx) <= DOUBLE_CLICK_PX and abs(y - ly) <= DOUBLE_CLICK_PX
            if lb == button and near and time.monotonic() - t < DOUBLE_CLICK_S:
                self.click_state = min(self.click_state + 1, 3)
            else:
                self.click_state = 1
            self.last_click = (time.monotonic(), x, y, button)
            self.down.add(button)
            kind = Q.kCGEventLeftMouseDown if left else Q.kCGEventRightMouseDown
        else:
            self.down.discard(button)
            kind = Q.kCGEventLeftMouseUp if left else Q.kCGEventRightMouseUp
        self._post_mouse(kind, x, y, Q.kCGMouseButtonLeft if left else Q.kCGMouseButtonRight)

    def scroll(self, dx, dy):
        Q = self.Q
        ev = Q.CGEventCreateScrollWheelEvent(
            None, Q.kCGScrollEventUnitPixel, 2, int(round(dy)), int(round(dx)))
        Q.CGEventPost(Q.kCGHIDEventTap, ev)

    def key(self, key, mods):
        Q = self.Q
        flags = 0
        for m in mods:
            flags |= self.flags.get(m, 0)
        code = SPECIAL_KEYS.get(key)
        shortcut = bool(set(mods) & {"cmd", "ctrl", "alt"})
        if code is None and shortcut:
            code = self.keycodes.get(key.lower())
            if code is None:
                log.warning("pas de touche pour %r dans la disposition active", key)
                return
        for is_down in (True, False):
            if code is not None:
                ev = Q.CGEventCreateKeyboardEvent(None, code, is_down)
                Q.CGEventSetFlags(ev, flags)
            else:  # texte : indépendant de la disposition du Mac
                ev = Q.CGEventCreateKeyboardEvent(None, 0, is_down)
                Q.CGEventSetFlags(ev, 0)
                Q.CGEventKeyboardSetUnicodeString(ev, len(key), key)
            Q.CGEventPost(Q.kCGHIDEventTap, ev)


def handle_input(inp, msg):
    t = msg.get("t")
    if t == "move":
        inp.move(float(msg["dx"]), float(msg["dy"]))
    elif t == "moveto":
        inp.move_to(min(max(float(msg["x"]), 0), 1), min(max(float(msg["y"]), 0), 1))
    elif t in ("down", "up"):
        inp.button("right" if msg.get("b") == "right" else "left", t == "down")
    elif t == "scroll":
        inp.scroll(float(msg.get("dx", 0)), float(msg.get("dy", 0)))
    elif t == "key":
        key = str(msg["key"])[:8]
        mods = [m for m in msg.get("mods", []) if m in ("cmd", "ctrl", "alt", "shift")]
        if key:
            inp.key(key, mods)

# ------------------------------------------------------------------ vidéo


class ScreenSource:
    """Capture de l'écran principal avec mss, dans un fil dédié."""

    def __init__(self, max_width):
        self.max_width = max_width
        self.pool = ThreadPoolExecutor(max_workers=1)
        self.sct = None

    def _grab(self):
        if self.sct is None:
            import mss
            self.sct = mss.mss()
        shot = self.sct.grab(self.sct.monitors[1])
        arr = np.frombuffer(shot.raw, dtype=np.uint8).reshape(shot.height, shot.width, 4)
        frame = VideoFrame.from_ndarray(arr, format="bgra")
        scale = min(1.0, self.max_width / shot.width)
        w = int(shot.width * scale) // 2 * 2
        h = int(shot.height * scale) // 2 * 2
        return frame.reformat(width=w, height=h, format="yuv420p")

    async def frame(self):
        return await asyncio.get_running_loop().run_in_executor(self.pool, self._grab)


class TestSource:
    """Mire animée pour --dry-run."""

    def __init__(self, inp):
        self.inp, self.n = inp, 0
        yy, xx = np.mgrid[0:450, 0:720]
        self.base = np.stack([xx * 255 // 720, yy * 255 // 450, 0 * xx + 90], -1).astype(np.uint8)

    async def frame(self):
        img = self.base.copy()
        self.n += 1
        x = (self.n * 6) % 680
        img[200:240, x:x + 40] = 255
        return VideoFrame.from_ndarray(img, format="rgb24").reformat(format="yuv420p")


class ScreenTrack(VideoStreamTrack):
    def __init__(self, source, fps):
        super().__init__()
        self.source, self.period = source, 1.0 / fps
        self._t0, self._n = None, 0

    async def recv(self):
        if self._t0 is None:
            self._t0 = time.monotonic()
        else:
            self._n += 1
            wait = self._t0 + self._n * self.period - time.monotonic()
            if wait > 0:
                await asyncio.sleep(wait)
            else:  # capture plus lente que la cadence : on ne rattrape pas
                self._t0, self._n = time.monotonic(), 0
        frame = await self.source.frame()
        frame.pts = int(time.monotonic() * 90000)
        frame.time_base = fractions.Fraction(1, 90000)
        return frame

# ---------------------------------------------------------------- serveur


def authorized(request):
    given = request.query.get("t", "")
    return secrets.compare_digest(given, request.app["token"])


async def index(request):
    if not authorized(request):
        return web.Response(status=403, text="Jeton manquant ou invalide.")
    return web.FileResponse(STATIC / "index.html")


async def offer(request):
    if not authorized(request):
        return web.Response(status=403)
    app = request.app
    params = await request.json()
    state = app["state"]
    if state.get("pc"):
        await state["pc"].close()
    pc = RTCPeerConnection(RTCConfiguration(iceServers=[]))
    state["pc"] = pc
    sender = pc.addTrack(ScreenTrack(app["source"], app["fps"]))
    caps = RTCRtpSender.getCapabilities("video").codecs
    h264 = [c for c in caps if c.mimeType == "video/H264"]
    rest = [c for c in caps if c.mimeType != "video/H264"]
    next(t for t in pc.getTransceivers() if t.sender is sender) \
        .setCodecPreferences(h264 + rest)

    @pc.on("connectionstatechange")
    async def _state():
        log.info("WebRTC : %s", pc.connectionState)
        if pc.connectionState in ("failed", "closed"):
            await pc.close()

    await pc.setRemoteDescription(RTCSessionDescription(params["sdp"], params["type"]))
    await pc.setLocalDescription(await pc.createAnswer())
    return web.json_response(
        {"sdp": pc.localDescription.sdp, "type": pc.localDescription.type})


async def ws_handler(request):
    if not authorized(request):
        return web.Response(status=403)
    ws = web.WebSocketResponse(heartbeat=15)
    await ws.prepare(request)
    inp = request.app["input"]
    log.info("télécommande connectée depuis %s", request.remote)

    async def push_cursor():
        last = None
        while not ws.closed:
            try:
                pos = inp.cursor()
            except Exception:  # noqa: BLE001
                pos = None
            if pos and pos != last:
                last = pos
                await ws.send_json({"t": "cursor", "x": round(pos[0], 4), "y": round(pos[1], 4)})
            await asyncio.sleep(1 / 60)

    task = asyncio.create_task(push_cursor())
    try:
        async for msg in ws:
            if msg.type != WSMsgType.TEXT:
                continue
            try:
                handle_input(inp, json.loads(msg.data))
            except Exception as e:  # noqa: BLE001
                log.warning("message ignoré (%s) : %.80s", e, msg.data)
    finally:
        task.cancel()
        for b in ("left", "right"):  # ne jamais laisser un bouton enfoncé
            if b in getattr(inp, "down", ()):
                inp.button(b, False)
        log.info("télécommande déconnectée")
    return ws


async def on_shutdown(app):
    if app["state"].get("pc"):
        await app["state"]["pc"].close()


def load_token(renew):
    if TOKEN_FILE.exists() and not renew:
        tok = TOKEN_FILE.read_text().strip()
        if len(tok) >= 16:
            return tok
    tok = secrets.token_urlsafe(18)
    TOKEN_FILE.write_text(tok)
    TOKEN_FILE.chmod(0o600)
    return tok


def local_addresses():
    addrs = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            addrs.add(info[4][0])
    except OSError:
        pass
    for target in ("192.168.0.1", "100.100.100.100"):  # LAN, Tailscale
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect((target, 9))
            addrs.add(s.getsockname()[0])
        except OSError:
            pass
        finally:
            s.close()
    return sorted(a for a in addrs if not a.startswith("127."))


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--max-width", type=int, default=1920,
                    help="largeur maximale de l'image envoyée (défaut 1920)")
    ap.add_argument("--bitrate", type=float, default=8.0, help="débit vidéo max en Mbit/s")
    ap.add_argument("--new-token", action="store_true", help="génère un nouveau jeton")
    ap.add_argument("--dry-run", action="store_true",
                    help="mire + entrées journalisées (test sans Mac)")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
    logging.getLogger("aioice").setLevel(logging.WARNING)
    logging.getLogger("aiohttp.access").setLevel(logging.WARNING)

    # aiortc plafonne le débit trop bas pour du texte lisible : on relève les bornes.
    bps = int(args.bitrate * 1_000_000)
    for mod in (_h264, _vpx):
        mod.MAX_BITRATE = bps
        mod.DEFAULT_BITRATE = max(mod.MIN_BITRATE, bps // 2)

    if args.dry_run:
        inp = DummyInput()
        source = TestSource(inp)
    elif sys.platform != "darwin":
        sys.exit("Ce serveur pilote un Mac. Hors macOS, utilisez --dry-run.")
    else:
        inp = QuartzInput()
        source = ScreenSource(args.max_width)

    app = web.Application()
    app.update(token=load_token(args.new_token), input=inp, source=source, fps=args.fps, state={})
    app.router.add_get("/", index)
    app.router.add_post("/offer", offer)
    app.router.add_get("/ws", ws_handler)
    app.on_shutdown.append(on_shutdown)

    print("\nOuvre l'une de ces adresses dans Safari sur l'iPhone :")
    for a in local_addresses() or ["<adresse-du-mac>"]:
        print(f"  http://{a}:{args.port}/?t={app['token']}")
    print("Ce lien donne le contrôle total du Mac : ne le partage pas.\n")
    web.run_app(app, host=args.host, port=args.port, print=None)


if __name__ == "__main__":
    main()
