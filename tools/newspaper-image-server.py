"""
아티팩트 HTML을 로컬에서 서빙하면서, 브라우저(html2canvas)가 만든 신문 지면
이미지를 저장할 수 있게 해주는 작은 서버.

용도: 예약 작업(daily-econ-brief) 5단계에서 "오늘의 경제 브리핑" 아티팩트를
텔레그램에 이미지로 보낼 때 쓴다. claude.ai 아티팩트 URL을 브라우저로 직접 열면
공유 링크의 "pinned"(구버전) 스냅샷이 보일 수 있으므로, 반드시 방금 발행한
로컬 HTML 사본을 이 서버로 서빙해서 캡처해야 한다.

사용법:
    python tools/newspaper-image-server.py <서빙할_디렉토리> <저장할_디렉토리> [포트]

엔드포인트:
    GET  /<파일명>        -> serve_dir 안의 정적 파일을 서빙
    POST /save?file=NAME  -> body(원시 base64 텍스트, data: 접두어 없이)를 디코딩해
                              save_dir/NAME 에 저장하고 "OK <bytes>" 를 응답한다.
                              file 파라미터를 생략하면 newspaper.jpg 로 저장한다.
                              여러 장(page1.jpg, page2.jpg, ...)을 순서대로 저장할 수 있다.

Ctrl+C 또는 프로세스 종료로 멈춘다 — 이미지 저장 후에는 반드시 종료해서
포트를 남겨두지 않는다.
"""
import http.server
import socketserver
import os
import sys
import base64
from urllib.parse import urlparse, parse_qs

serve_dir = sys.argv[1] if len(sys.argv) > 1 else "."
save_dir = sys.argv[2] if len(sys.argv) > 2 else "."
port = int(sys.argv[3]) if len(sys.argv) > 3 else 8791


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=serve_dir, **kwargs)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/save":
            qs = parse_qs(parsed.query)
            name = qs.get("file", ["newspaper.jpg"])[0]
            name = os.path.basename(name)  # no path traversal
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            out_path = os.path.join(save_dir, name)
            with open(out_path, "wb") as f:
                f.write(base64.b64decode(body))
            self.send_response(200)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(("OK " + out_path + " " + str(len(body))).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()


with socketserver.TCPServer(("", port), Handler) as httpd:
    print(f"serving {serve_dir} on {port}, saving POST /save?file=NAME into {save_dir}")
    httpd.serve_forever()
