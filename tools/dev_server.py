#!/usr/bin/env python3

import http.server
import os
import socketserver

PORT_NO = 8001

# Address to listen on. This is for looking at the site while working on it, so
# it answers this machine and nothing else: the whole repo is served, .git and
# any untracked notes included, and an empty host would hand all of that to
# whatever network the machine is on.
HOST_NAME = '127.0.0.1'

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
with socketserver.TCPServer((HOST_NAME, PORT_NO), MyHTTPRequestHandler) as server:
    print('Serving at http://localhost:{}'.format(PORT_NO))
    server.serve_forever()
