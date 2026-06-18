#!/bin/bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# 단일 이미지(api + web 통합)를 로컬에서 빌드 → GHCR push + 호스트 docker daemon load.
# 한 컨테이너에서 NestJS API(10151)와 Next.js web(10150)을 동시에 구동한다.
# CI(.github/workflows/docker-build.yml)와 동일한 결과물을 로컬에서 빠르게 뽑기 위한 스크립트.
#
# 사용 예:
#   ./build.sh                 # latest 태그로 빌드
#   ./build.sh -f              # 캐시 무시(no-cache)
#   ./build.sh -t v1.0         # v1.0 태그로 빌드
#   DOPPLER_CONFIG=stg ./build.sh   # 빌드 시 stg config의 NEXT_PUBLIC_* 사용
# ─────────────────────────────────────────────────────────────────────────────

# Configuration
IMAGE_NAME="ghcr.io/skyeon15/api"
DOPPLER_PROJECT="api-platform"
DOPPLER_CONFIG="${DOPPLER_CONFIG:-prd}"    # NEXT_PUBLIC_* 인라인용 (CI와 동일하게 prd 기본)
CACHE_REF="${IMAGE_NAME}:buildcache"
TAG="latest"
CACHE_OPT=""
GIT_SHA="$(git rev-parse --short HEAD)"

# 인자 처리: -f(no-cache), -t <tag>
while [[ "$#" -gt 0 ]]; do
    case "$1" in
        -f) CACHE_OPT="--no-cache"; shift ;;
        -t) TAG="$2"; shift 2 ;;
        *) echo "❌ 알 수 없는 인자: $1 (사용 가능: -f, -t <tag>)"; exit 1 ;;
    esac
done

FULL_IMAGE_NAME="${IMAGE_NAME}:${TAG}"
SHA_IMAGE_NAME="${IMAGE_NAME}:${GIT_SHA}"

echo "🚀 빌드 & 푸시 시작 (SHA: ${GIT_SHA}) ${CACHE_OPT:+[No-Cache]}"

# Doppler 로그인 확인 (NEXT_PUBLIC_* fetch에 필요)
if ! doppler me >/dev/null 2>&1; then
    echo "❌ Doppler 로그인 필요: doppler login"
    exit 1
fi

# buildx 빌더 준비 (없으면 생성) — docker-container 드라이버여야 registry cache 활용 가능
if ! docker buildx inspect api-builder >/dev/null 2>&1; then
    docker buildx create --name api-builder --driver docker-container --use
else
    docker buildx use api-builder
fi

# Doppler에서 NEXT_PUBLIC_* 시크릿을 가져와 --build-arg로 전달.
# (Next.js는 NEXT_PUBLIC_* 를 빌드 시점에 클라이언트 번들로 인라인하므로 런타임 주입 불가.)
echo "🔑 Doppler에서 NEXT_PUBLIC_* fetch (${DOPPLER_PROJECT}/${DOPPLER_CONFIG})..."
BUILD_ARGS=()
# docker 포맷은 따옴표 없는 NAME=value 한 줄씩이라 --build-arg에 그대로 사용 가능.
NEXT_PUBLIC_LINES="$(doppler secrets download --no-file --format docker \
    --project "${DOPPLER_PROJECT}" --config "${DOPPLER_CONFIG}" 2>/dev/null \
    | grep '^NEXT_PUBLIC_' || true)"
if [[ -n "${NEXT_PUBLIC_LINES}" ]]; then
    while IFS= read -r line; do
        [[ -z "${line}" ]] && continue
        BUILD_ARGS+=(--build-arg "${line}")
        echo "   ✓ ${line%%=*}"
    done <<< "${NEXT_PUBLIC_LINES}"
fi

# 참고: web→api 프록시 타깃은 브라우저에 노출 안 되는 서버사이드 값이라 build-arg가 아니다.
# next.config.ts의 API_PROXY_TARGET(런타임 env, 기본값 localhost:10151)이 처리한다.

echo "🔨 이미지 빌드 & 푸시 + 로컬 load: ${FULL_IMAGE_NAME}"
# --push: GHCR 업로드 / --load: 호스트 docker daemon에도 적재
#   → 같은 머신의 Coolify가 GHCR 재다운로드 없이 로컬 이미지 사용 가능
#     (Coolify pull policy를 IfNotPresent/Never로 설정해야 효과 발휘)
docker buildx build \
    ${CACHE_OPT} \
    --provenance=false \
    --sbom=false \
    "${BUILD_ARGS[@]}" \
    --cache-from="type=registry,ref=${CACHE_REF}" \
    --cache-to="type=registry,ref=${CACHE_REF},mode=min" \
    -t "${FULL_IMAGE_NAME}" \
    -t "${SHA_IMAGE_NAME}" \
    --push \
    --load \
    .

echo "✅ 완료: ${TAG} 및 ${GIT_SHA} 태그로 푸시 + 로컬 load 완료."

# ----- 미사용 구버전 이미지 정리 -----
# 현재 빌드한 latest / GIT_SHA / buildcache는 보존.
# 컨테이너(running·stopped)에서 참조 중인 이미지는 건드리지 않음.
echo "🧹 미사용 ${IMAGE_NAME} 이미지 정리..."
KEEP_TAGS="^(latest|${TAG}|${GIT_SHA}|buildcache)$"
docker image ls "${IMAGE_NAME}" --format '{{.Tag}} {{.ID}}' \
  | while read -r tag id; do
      [[ -z "${tag}" || "${tag}" == "<none>" ]] && continue
      [[ "${tag}" =~ ${KEEP_TAGS} ]] && continue
      target="${IMAGE_NAME}:${tag}"
      if docker ps -a --filter "ancestor=${target}" -q | grep -q .; then
          echo "   ↳ skip ${target} (in use)"
          continue
      fi
      if docker rmi "${target}" >/dev/null 2>&1; then
          echo "   ↳ rm   ${target}"
      fi
  done
# 태그 떨어진 dangling 레이어 정리
docker image prune -f >/dev/null 2>&1 || true
echo "✅ 정리 완료."
