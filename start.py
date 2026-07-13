#!/usr/bin/env python3
"""零依赖本地静态服务器 —— 用于预览站点 / 调试后台。
   用法:  python start.py            # 默认 http://localhost:8000
          python start.py 8080       # 自定义端口
   说明: 直接双击打开 index.html 会因浏览器安全策略无法读取 content.json，
         必须通过本地服务器访问（localhost 也满足后台的同源/API 调用）。
"""
import sys
import http.server
import socketserver
from urllib.parse import urlparse
from pathlib import Path

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ROOT = Path(__file__).resolve().parent


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        # 禁止缓存，方便改完内容立刻看到
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # 静默


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"▶ 站点预览:  http://localhost:{PORT}")
        print(f"▶ 管理后台:  http://localhost:{PORT}/admin.html")
        print("  按 Ctrl+C 停止")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n已停止。")
