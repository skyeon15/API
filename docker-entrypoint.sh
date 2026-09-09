#!/usr/bin/env bash
# 단일 이미지에서 NestJS API와 Next.js web을 한 컨테이너에 동시 구동.
# web(next.config rewrites)이 /api/* 를 API로 리버스프록시하므로 두 프로세스 모두 필요하다.
set -uo pipefail

# 런타임 시크릿 주입: DOPPLER_TOKEN(Coolify가 prd service token으로 주입)이 있으면
# doppler run으로 self-wrap 하여 prd config 전체를 process.env에 채운다.
# 토큰이 없으면(로컬 scripts/compose-doppler.sh 경로 — env_file로 이미 주입됨)
# 그대로 진행한다. _DOPPLER_WRAPPED 가드로 무한 재귀 방지.
if [[ -n "${DOPPLER_TOKEN:-}" && -z "${_DOPPLER_WRAPPED:-}" ]] && command -v doppler >/dev/null 2>&1; then
  export _DOPPLER_WRAPPED=1
  exec doppler run --silent -- "$0" "$@"
fi

WEB_PORT="${WEB_PORT:-10150}"
API_PORT="${API_PORT:-10151}"
API_WAIT_SEC="${API_WAIT_SEC:-120}"

# 한 프로세스라도 종료되면 나머지도 정리하고 컨테이너를 종료한다.
# → 오케스트레이터(compose/Coolify)가 컨테이너를 재시작하도록 위임.
api_pid=""
web_pid=""
terminate() { kill -TERM ${api_pid:-} ${web_pid:-} 2>/dev/null || true; }
trap terminate TERM INT

# NestJS API
#   cwd=/app 이어야 ServeStaticModule이 process.cwd()/public = /app/public 을 찾는다.
node apps/api/dist/main &
api_pid=$!

# 🔴 web 을 api 보다 먼저 띄우면 안 된다.
#
# 리버스프록시(Coolify 의 Caddy)는 컨테이너가 도커 네트워크에 붙는 즉시 업스트림에 넣는다 —
# 도커 헬스체크 상태를 보지 않는다. 그런데 web 은 1초면 뜨고 api 는 마이그레이션까지 하느라
# 8초쯤 걸린다. 그 사이 새 컨테이너로 넘어온 요청을 web 이 받아 api 로 프록시하려다 실패해
# 500 을 돌려준다(2026-09-09 배포 실측: 13초 교체 창에서 요청 197건 중 7건 실패).
# 게다가 500 은 프록시 입장에선 «업스트림이 정상 응답한 것»이라 다른 컨테이너로 재시도되지도
# 않는다. api 가 응답할 때까지 web 을 띄우지 않으면 그 요청들은 연결 실패가 되고, 그제서야
# 프록시의 재시도(lb_try_duration)가 살아 있는 구 컨테이너로 넘겨 준다.
echo "[entrypoint] API 기동 대기 (127.0.0.1:${API_PORT}/health, 최대 ${API_WAIT_SEC}초)"
api_ready=0
for _ in $(seq 1 "${API_WAIT_SEC}"); do
  if curl -fsS -o /dev/null "http://127.0.0.1:${API_PORT}/health"; then
    api_ready=1
    break
  fi
  # api 가 기동 중 죽었으면 더 기다릴 이유가 없다.
  if ! kill -0 "${api_pid}" 2>/dev/null; then
    echo "[entrypoint] API 프로세스가 기동 중 종료됐다" >&2
    wait "${api_pid}"
    exit $?
  fi
  sleep 1
done

# 여기서 web 을 띄우지 않고 실패로 끝내는 편이 낫다 — 컨테이너가 healthy 가 되지 않으므로
# Coolify 가 교체를 중단하고 구 버전을 그대로 둔다(fail-closed).
if [[ "${api_ready}" != "1" ]]; then
  echo "[entrypoint] API 가 ${API_WAIT_SEC}초 안에 준비되지 않았다 — 컨테이너를 실패로 끝낸다" >&2
  terminate
  exit 1
fi
echo "[entrypoint] API 준비 완료 — web 기동"

# Next.js web (standalone 빌드를 next start로 구동)
node_modules/.bin/next start apps/web -H 0.0.0.0 -p "${WEB_PORT}" &
web_pid=$!

wait -n
code=$?
terminate
wait
exit "${code}"
