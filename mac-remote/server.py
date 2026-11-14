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
import ctypes
import fractions
import json
import logging
import secrets
import socket
import sys
import threading
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
# Touches « caractère » d'un clavier Apple (ANSI + ISO), hors touches spéciales.
CHAR_KEYCODES = [k for k in range(0, 51) if k not in SPECIAL_KEYS.values()]
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


def _keyboard_layout():
    """(nom, traduire(code, mods)) pour la disposition clavier active (macOS).

    `mods` suit UCKeyTranslate : 0x01 ⌘, 0x02 ⇧, 0x08 ⌥.
    """
    vp = ctypes.c_void_p
    carbon = ctypes.cdll.LoadLibrary("/System/Library/Frameworks/Carbon.framework/Carbon")
    cf = ctypes.cdll.LoadLibrary(
        "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")
    carbon.TISCopyCurrentKeyboardLayoutInputSource.restype = vp
    carbon.TISGetInputSourceProperty.restype = vp
    carbon.TISGetInputSourceProperty.argtypes = [vp, vp]
    carbon.LMGetKbdType.restype = ctypes.c_uint8
    carbon.UCKeyTranslate.restype = ctypes.c_int32
    carbon.UCKeyTranslate.argtypes = [
        vp, ctypes.c_uint16, ctypes.c_uint16, ctypes.c_uint32, ctypes.c_uint32,
        ctypes.c_uint32, ctypes.POINTER(ctypes.c_uint32), ctypes.c_ulong,
        ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_uint16)]
    cf.CFDataGetBytePtr.restype = vp
    cf.CFDataGetBytePtr.argtypes = [vp]

    src = carbon.TISCopyCurrentKeyboardLayoutInputSource()
    if not src:
        raise OSError("aucune source clavier active")
    prop = lambda key: carbon.TISGetInputSourceProperty(  # noqa: E731
        src, vp.in_dll(carbon, key).value)
    data = prop("kTISPropertyUnicodeKeyLayoutData")
    if not data:
        raise OSError("la source active n'a pas de table Unicode")
    layout = cf.CFDataGetBytePtr(data)
    import objc
    name = str(objc.objc_object(c_void_p=prop("kTISPropertyInputSourceID")))
    kbd = carbon.LMGetKbdType()
    # `src` n'est jamais libérée : la table `layout` lui appartient.

    def translate(code, mods):
        dead, n = ctypes.c_uint32(0), ctypes.c_ulong(0)
        buf = (ctypes.c_uint16 * 4)()
        # 1 = kUCKeyTranslateNoDeadKeysMask ; 0 = kUCKeyActionDown
        st = carbon.UCKeyTranslate(layout, code, 0, mods, kbd, 1,
                                   ctypes.byref(dead), 4, ctypes.byref(n), buf)
        return bytes(buf)[: n.value * 2].decode("utf-16-le") if st == 0 else None

    return name, translate


def check_permissions():
    """Signale (et demande) les permissions macOS manquantes au démarrage."""
    import Quartz as Q
    from Foundation import NSDictionary
    import objc

    hi = ctypes.cdll.LoadLibrary(
        "/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices")
    hi.AXIsProcessTrustedWithOptions.restype = ctypes.c_bool
    hi.AXIsProcessTrustedWithOptions.argtypes = [ctypes.c_void_p]
    opts = NSDictionary.dictionaryWithDictionary_({"AXTrustedCheckOptionPrompt": True})
    ok = True
    if not Q.CGPreflightScreenCaptureAccess():
        Q.CGRequestScreenCaptureAccess()
        log.error("permission « Enregistrement de l'écran » manquante : image noire "
                  "ou fond d'écran seul")
        ok = False
    if not hi.AXIsProcessTrustedWithOptions(objc.pyobjc_id(opts)):
        log.error("permission « Accessibilité » manquante : clics et frappes ignorés")
        ok = False
    if not ok:
        log.error("accorde-les à l'app qui lance ce script (Réglages Système › "
                  "Confidentialité et sécurité), puis relance-le")


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
        self.keycodes = self._read_layout()

    def _read_layout(self):
        """Caractère -> code de touche pour la disposition active (AZERTY, etc.).

        Lit la disposition avec UCKeyTranslate, sans touches mortes. (Traduire des
        CGEvent synthétiques ne convient pas : l'état des touches mortes fuit d'un
        appel à l'autre, et ⇧ est ignoré.) Sans disposition lisible, les raccourcis
        sont refusés : un repli QWERTY ferait de ⌘A un ⌘Q sur un Mac AZERTY.
        """
        try:
            name, translate = _keyboard_layout()
        except Exception as e:  # noqa: BLE001
            log.error("disposition clavier illisible (%s) : raccourcis ⌘/⌃/⌥ désactivés", e)
            return {}
        table = {}
        # ⌘ d'abord (dispositions « … – QWERTY ⌘ »), puis sans modificateur, puis ⇧ :
        # sur AZERTY, ⌘1 vise ainsi la touche « & / 1 ».
        for mods in (0x01, 0x00, 0x02):
            for code in CHAR_KEYCODES:
                s = translate(code, mods)
                if s and len(s) == 1 and s.isprintable() and not s.isspace():
                    table.setdefault(s.lower(), code)
        top = "".join(translate(k, 0) or "?" for k in (12, 13, 14, 15, 17, 16))
        log.info("disposition clavier détectée : %s, %d caractères (rangée du haut : %s)",
                 name, len(table), top)
        if len(table) < 20:
            log.error("disposition clavier incomplète : raccourcis ⌘/⌃/⌥ désactivés")
            return {}
        return table

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
                Q.CGEventKeyboardSetUnicodeString(ev, len(key.encode("utf-16-le")) // 2, key)
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
        key = str(msg["key"])
        mods = [m for m in msg.get("mods", []) if m in ("cmd", "ctrl", "alt", "shift")]
        if key not in SPECIAL_KEYS:
            # Un nom de touche inconnu (« Delete », « F5 »…) ne doit pas être tapé en toutes
            # lettres ; seul un caractère (ou un emoji composé) passe comme texte.
            if len(key) > 1 and key.isascii():
                log.warning("touche inconnue ignorée : %r", key)
                return
            key = key[:8]
        if key:
            inp.key(key, mods)

# ------------------------------------------------------------------ vidéo


def _even_size(w, h, max_width):
    scale = min(1.0, max_width / w)
    return max(2, int(w * scale) // 2 * 2), max(2, int(h * scale) // 2 * 2)


class ScreenSource:
    """Capture de l'écran principal, convertie en yuv420p dans un fil dédié.

    ScreenCaptureKit (macOS 12.3+) livre des images déjà réduites, à la cadence
    voulue ; mss (CGWindowListCreateImage) sert de repli : ~100 ms par image sur
    un écran Retina, soit moins de 10 images/s quelle que soit --max-width.
    """

    def __init__(self, max_width, fps=30):
        self.max_width, self.fps = max_width, fps
        self.pool = ThreadPoolExecutor(max_workers=1)
        self.sct = None
        self.sck = None  # démarré à la première image demandée, pas au lancement
        self.sck_failed = False
        self._resume = False

    def _start_sck(self):
        try:
            self.sck = _SCKCapture(self.max_width, self.fps)
            log.info("capture : ScreenCaptureKit, %dx%d", self.sck.width, self.sck.height)
        except Exception as e:  # noqa: BLE001
            self.sck_failed = True
            log.warning("ScreenCaptureKit indisponible (%s) : repli sur mss, plus lent", e)

    def _grab_mss(self):
        if self.sct is None:
            import mss
            self.sct = (getattr(mss, "MSS", None) or mss.mss)()
        shot = self.sct.grab(self.sct.monitors[1])
        return np.frombuffer(shot.raw, dtype=np.uint8).reshape(shot.height, shot.width, 4)

    def resume(self):
        """Nouvelle connexion : relance la capture si macOS l'avait arrêtée."""
        self._resume = True

    def _grab(self):
        resume, self._resume = self._resume, False
        if self.sck is not None and self.sck.stopped and resume:
            self.sck = None
        if self.sck is None and not self.sck_failed:
            self._start_sck()
        sck = self.sck
        arr = sck.latest(timeout=1.0) if sck else self._grab_mss()
        if arr is None:  # pas encore d'image, ou capture arrêtée depuis macOS : noir
            arr = np.zeros((sck.height, sck.width, 4), np.uint8)
        w, h = _even_size(arr.shape[1], arr.shape[0], self.max_width)
        return VideoFrame.from_ndarray(arr, format="bgra").reformat(
            width=w, height=h, format="yuv420p")

    async def frame(self):
        return await asyncio.get_running_loop().run_in_executor(self.pool, self._grab)

    def close(self):
        if self.sck:
            self.sck.stop()
            self.sck = None


_SCK = {}


def _sck_runtime():
    """Charge ScreenCaptureKit et déclare, une seule fois, la classe qui reçoit les images."""
    if _SCK:
        return _SCK
    import objc
    import ScreenCaptureKit as SCK
    from Foundation import NSObject

    # Le module CoreMedia de PyObjC ne se charge pas avec tous les Python
    # (libswiftCoreMedia introuvable) : on passe par ctypes.
    vp = ctypes.c_void_p
    cm = ctypes.cdll.LoadLibrary("/System/Library/Frameworks/CoreMedia.framework/CoreMedia")
    cv = ctypes.cdll.LoadLibrary("/System/Library/Frameworks/CoreVideo.framework/CoreVideo")
    cm.CMSampleBufferGetImageBuffer.restype = vp
    cm.CMSampleBufferGetImageBuffer.argtypes = [vp]
    for n in ("Width", "Height", "BytesPerRow"):
        f = getattr(cv, "CVPixelBufferGet" + n)
        f.restype, f.argtypes = ctypes.c_size_t, [vp]
    cv.CVPixelBufferGetBaseAddress.restype = vp
    cv.CVPixelBufferGetBaseAddress.argtypes = [vp]
    for n in ("Lock", "Unlock"):
        f = getattr(cv, f"CVPixelBuffer{n}BaseAddress")
        f.restype, f.argtypes = ctypes.c_int32, [vp, ctypes.c_uint64]
    objc.createOpaquePointerType("CMSampleBufferRef", b"^{opaqueCMSampleBuffer=}")

    class MacRemoteStreamOutput(NSObject, protocols=[
            objc.protocolNamed("SCStreamOutput"), objc.protocolNamed("SCStreamDelegate")]):
        def stream_didStopWithError_(self, stream, error):
            try:
                self.owner._stopped(error)
            except Exception as e:  # noqa: BLE001
                log.warning("arrêt de capture mal géré : %s", e)

        def stream_didOutputSampleBuffer_ofType_(self, stream, sbuf, kind):
            if kind != SCK.SCStreamOutputTypeScreen:
                return
            try:
                img = cm.CMSampleBufferGetImageBuffer(sbuf.__pointer__)
                if not img:  # image « inchangée » : rien à copier
                    return
                cv.CVPixelBufferLockBaseAddress(img, 1)
                try:
                    h, w = cv.CVPixelBufferGetHeight(img), cv.CVPixelBufferGetWidth(img)
                    bpr = cv.CVPixelBufferGetBytesPerRow(img)
                    raw = (ctypes.c_uint8 * (bpr * h)).from_address(
                        cv.CVPixelBufferGetBaseAddress(img))
                    arr = np.frombuffer(raw, np.uint8).reshape(h, bpr // 4, 4)[:, :w].copy()
                finally:
                    cv.CVPixelBufferUnlockBaseAddress(img, 1)
                self.owner._deliver(arr)
            except Exception as e:  # noqa: BLE001 — une exception ici tuerait le processus
                log.warning("image ignorée : %s", e)

    _SCK.update(SCK=SCK, Output=MacRemoteStreamOutput)
    return _SCK


class _SCKCapture:
    """Flux ScreenCaptureKit de l'écran principal ; garde la dernière image BGRA."""

    def __init__(self, max_width, fps):
        import Quartz as Q

        rt = _sck_runtime()
        SCK = rt["SCK"]
        self._cond = threading.Condition()
        self._arr = None
        self._stream = None
        self.stopped = False

        content, err = self._wait(SCK.SCShareableContent.getShareableContentWithCompletionHandler_)
        if err is not None or content is None:
            raise OSError(err)
        main = Q.CGMainDisplayID()
        display = next(d for d in content.displays() if d.displayID() == main)
        mode = Q.CGDisplayCopyDisplayMode(main)
        px_w = Q.CGDisplayModeGetPixelWidth(mode) if mode else display.width()
        px_h = Q.CGDisplayModeGetPixelHeight(mode) if mode else display.height()
        self.width, self.height = _even_size(px_w, px_h, max_width)

        cfg = SCK.SCStreamConfiguration.alloc().init()
        cfg.setWidth_(self.width)
        cfg.setHeight_(self.height)
        cfg.setMinimumFrameInterval_((1, fps, 1, 0))  # CMTime 1/fps
        cfg.setPixelFormat_(int.from_bytes(b"BGRA", "big"))
        cfg.setShowsCursor_(False)  # la page dessine son propre curseur
        cfg.setQueueDepth_(3)
        flt = SCK.SCContentFilter.alloc().initWithDisplay_excludingWindows_(display, [])
        self._output = rt["Output"].alloc().init()  # reçoit les images et l'arrêt
        self._output.owner = self
        stream = SCK.SCStream.alloc().initWithFilter_configuration_delegate_(
            flt, cfg, self._output)
        ok, err = stream.addStreamOutput_type_sampleHandlerQueue_error_(
            self._output, SCK.SCStreamOutputTypeScreen, None, None)
        if not ok:
            raise OSError(err)
        (err,) = self._wait(stream.startCaptureWithCompletionHandler_)
        if err is not None:
            raise OSError(err)
        self._stream = stream

    @staticmethod
    def _wait(start):
        done, box = threading.Event(), {}

        def handler(*a):  # bloc ObjC : ne doit rien renvoyer
            box["r"] = a
            done.set()
        start(handler)
        if not done.wait(10):
            raise TimeoutError("ScreenCaptureKit ne répond pas")
        return box["r"]

    def _deliver(self, arr):
        with self._cond:
            self._arr = arr
            self._cond.notify_all()

    def _stopped(self, error):
        """macOS a coupé le flux (« Arrêter le partage » dans la barre des menus, veille…).

        Sans cela, la dernière image resterait figée sur le téléphone.
        """
        why = error.localizedDescription() if error is not None else "sans erreur"
        log.warning("capture arrêtée par macOS (%s) : image noire ; recharge la page du "
                    "téléphone pour la relancer", why)
        with self._cond:
            self.stopped, self._stream, self._arr = True, None, None
            self._cond.notify_all()

    def latest(self, timeout):
        with self._cond:
            if self._arr is None and not self.stopped:
                self._cond.wait(timeout)
            return self._arr

    def stop(self):
        stream, self._stream = self._stream, None
        if stream is not None:
            try:
                self._wait(stream.stopCaptureWithCompletionHandler_)
            except Exception:  # noqa: BLE001
                pass


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
    if hasattr(app["source"], "resume"):
        app["source"].resume()
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
    sockets = request.app["state"].setdefault("sockets", set())
    sockets.add(ws)
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
        sockets.discard(ws)
        task.cancel()
        for b in ("left", "right"):  # ne jamais laisser un bouton enfoncé
            if b in getattr(inp, "down", ()):
                inp.button(b, False)
        log.info("télécommande déconnectée")
    return ws


async def on_shutdown(app):
    # Sans cela, l'arrêt (Ctrl-C) attend jusqu'à 60 s qu'un téléphone connecté se déconnecte.
    for ws in list(app["state"].get("sockets", ())):
        await ws.close(code=1001, message=b"arret du serveur")
    if app["state"].get("pc"):
        await app["state"]["pc"].close()
    close = getattr(app["source"], "close", None)
    if close:
        close()


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
        check_permissions()
        inp = QuartzInput()
        source = ScreenSource(args.max_width, args.fps)

    app = web.Application()
    app.update(token=load_token(args.new_token), input=inp, source=source, fps=args.fps, state={})
    app.router.add_get("/", index)
    app.router.add_post("/offer", offer)
    app.router.add_get("/ws", ws_handler)
    app.on_shutdown.append(on_shutdown)

    print("\nOuvre l'une de ces adresses dans Safari sur l'iPhone :")
    for a in local_addresses() or ["<adresse-du-mac>"]:
        print(f"  http://{a}:{args.port}/?t={app['token']}")
    print("Ce lien donne le contrôle total du Mac : ne le partage pas.\n", flush=True)
    web.run_app(app, host=args.host, port=args.port, print=None)


if __name__ == "__main__":
    main()
