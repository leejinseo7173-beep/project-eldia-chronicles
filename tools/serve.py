# ============================================================
# serve.py — 개발용 로컬 정적 서버 (캐시 끔)
#
# python -m http.server 를 그냥 쓰면 브라우저가 ES 모듈을 강하게 캐시해서,
# 코드를 고쳐도 옛 모듈이 그대로 돈다. 새로고침(F5)으로도 안 바뀌어
# "고쳤는데 반영이 안 되는" 현상으로 시간을 여러 번 날렸다.
# 이 서버는 모든 응답에 no-store 를 붙여 그 문제를 없앤다.
#
#   python tools/serve.py [포트]
# ============================================================

import sys
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 3010
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    # 조건부 요청(If-Modified-Since)에 304를 주지 않도록 무력화
    def send_head(self):
        if 'If-Modified-Since' in self.headers:
            del self.headers['If-Modified-Since']
        if 'If-None-Match' in self.headers:
            del self.headers['If-None-Match']
        return super().send_head()

    def log_message(self, fmt, *args):
        pass   # 요청 로그는 조용히


if __name__ == '__main__':
    # 한글 콘솔(cp949)이나 출력 리다이렉트에서 유니코드 문자로 죽지 않게 한다.
    # 실제로 em dash(—) 하나 때문에 서버가 시작도 못 하고 UnicodeEncodeError로 끝난 적이 있다.
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

    def say(msg):
        try:
            print(msg)
        except Exception:
            print(msg.encode('ascii', 'replace').decode('ascii'))

    say(f'엘디아 연대기 개발 서버 - http://localhost:{PORT}  (캐시 끔)')
    say(f'루트: {ROOT}')
    say('이 창을 닫으면 서버가 종료됩니다.')
    try:
        ThreadingHTTPServer(('127.0.0.1', PORT), NoCacheHandler).serve_forever()
    except OSError as e:
        say(f'포트 {PORT}를 열 수 없습니다: {e}')
        say(f'이미 서버가 떠 있거나 다른 프로그램이 쓰는 중입니다. 다른 포트: python tools/serve.py 3011')
        sys.exit(1)
    except KeyboardInterrupt:
        say('서버를 종료합니다.')
