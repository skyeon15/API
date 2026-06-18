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

# NestJS API
#   cwd=/app 이어야 ServeStaticModule이 process.cwd()/public = /app/public 을 찾는다.
node apps/api/dist/main &
api_pid=$!

# Next.js web (standalone 빌드를 next start로 구동)
node_modules/.bin/next start apps/web -H 0.0.0.0 -p "${WEB_PORT}" &
web_pid=$!

# 한 프로세스라도 종료되면 나머지도 정리하고 컨테이너를 종료한다.
# → 오케스트레이터(compose/Coolify)가 컨테이너를 재시작하도록 위임.
terminate() { kill -TERM "${api_pid}" "${web_pid}" 2>/dev/null || true; }
trap terminate TERM INT

wait -n
code=$?
terminate
wait
exit "${code}"
