"""Servidor local sin caché. Acepta PUT solo para models/*.glb (lo usa tools/forge.html)."""
import http.server, functools, sys, os, re

root = sys.argv[1]
port = int(sys.argv[2])


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def do_PUT(self):
        m = re.fullmatch(r'/models/([a-z0-9_]+\.glb)', self.path)
        if not m:
            self.send_error(403); return
        n = int(self.headers.get('Content-Length', 0))
        data = self.rfile.read(n)
        with open(os.path.join(root, 'models', m.group(1)), 'wb') as f:
            f.write(data)
        self.send_response(201); self.end_headers()


http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Handler, directory=root)).serve_forever()
