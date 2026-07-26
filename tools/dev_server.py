#!/usr/bin/env python3

import http.server
import os
import socketserver

PORT_NO = 8001

# Serve the repo root, so the script can be run from anywhere.
SERVE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Based on:
# https://www.frontendeng.dev/blog/38-disable-cache-for-python-http-server
class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=SERVE_DIR, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

# Start the server
with socketserver.TCPServer(('', PORT_NO), MyHTTPRequestHandler) as server:
    print('Serving at http://localhost:{}'.format(PORT_NO))
    server.serve_forever()
