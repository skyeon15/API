#!/usr/bin/env bash
# Doppler 시크릿을 임시 .env.runtime 파일로 내려받아 docker compose에 주입.
# 사용 예:
#   ./scripts/compose-doppler.sh up                                 # dev compose up
#   ./scripts/compose-doppler.sh -f docker-compose.prod.yml up -d   # prod compose up -d
#   ./scripts/compose-doppler.sh down                               # dev compose down
#
# Doppler 대시보드에서 키를 추가/삭제하면 이 스크립트가 매번 새로 fetch하므로
# docker-compose.yml 무수정으로 자동 반영됩니다.
set -euo pipefail

if ! command -v doppler >/dev/null 2>&1; then
  echo "ERROR: doppler CLI가 설치되어 있지 않습니다." >&2
  echo "  설치: https://docs.doppler.com/docs/install-cli" >&2
  exit 1
fi

# 저장소 루트에서 실행 강제 (compose.yml과 .env.runtime 경로 일치 필요)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/.."

ENV_FILE=".env.runtime"
trap 'rm -f "$ENV_FILE"' EXIT INT TERM HUP

# 700/600 권한으로 생성 후 시크릿 쓰기
( umask 077 && : > "$ENV_FILE" )
doppler secrets download --no-file --format env > "$ENV_FILE"

# --env-file: compose.yml의 ${VAR} 보간용
# 각 service의 env_file: .env.runtime: 컨테이너 환경변수 주입용
# (exec를 쓰지 않는 이유: trap 실행 보장. compose `up -d`는 컨테이너 시작 후
#  즉시 반환하고 컨테이너는 이미 env를 메모리에 갖고 있으므로 파일 삭제 안전.)
docker compose --env-file "$ENV_FILE" "$@"
