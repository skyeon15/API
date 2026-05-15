# 에케 API EKE API

## 환경변수 (Doppler)

이 프로젝트의 시크릿은 [Doppler](https://www.doppler.com/) 프로젝트 `api-platform` 에서 관리합니다. 로컬에 `.env` 파일을 두지 않습니다.

### 최초 1회 셋업

```bash
# 1. Doppler CLI 설치 (macOS)
brew install dopplerhq/cli/doppler
# Linux/WSL: curl -Ls https://cli.doppler.com/install.sh | sh

# 2. 로그인 (브라우저 SSO)
doppler login

# 3. 프로젝트/config 바인딩 (저장소 루트에서)
doppler setup
#   ? Select a project: api-platform
#   ? Select a config: dev
```

이후 `.doppler/` 가 저장소 루트에 생성되어 `dev` config가 기본으로 잠깁니다.

### 일상 명령

| 목적 | 명령 |
|------|------|
| 모노레포 dev 서버 (호스트) | `npm run dev` (← 내부적으로 `doppler run -- turbo dev`) |
| 빌드 | `npm run build` |
| 마이그레이션 | `npm run migration:run` |
| Docker compose dev | `./scripts/compose-doppler.sh up` |
| Docker compose down | `./scripts/compose-doppler.sh down` |
| 임시로 시크릿 확인 | `doppler secrets` |

`npm run *` 스크립트는 이미 `doppler run --` 으로 래핑되어 있어 별도 prefix가 필요 없습니다.

`compose-doppler.sh` 는 Doppler에서 시크릿을 임시 `.env.runtime` 파일로 내려받아 docker compose에 주입하는 wrapper 입니다. Doppler 대시보드에서 키를 추가/삭제해도 compose 파일을 수정할 필요가 없습니다.

### 운영 배포

운영 호스트에 1회만 설정:

```bash
# Doppler CLI 설치 후
export DOPPLER_TOKEN=dp.st.prd.xxxxxxxxxxxxxxxxxxxx   # prd config의 service token
# (혹은 /etc/environment, systemd EnvironmentFile에 영구 저장)
```

이후 배포:

```bash
./scripts/compose-doppler.sh -f docker-compose.prod.yml up -d
```

운영 호스트에서 `doppler setup --config prd` 를 1회 실행해두면 스크립트가 자동으로 prd config를 사용합니다.

### CI/CD (GitHub Actions)

`docker-build.yml` 이 빌드 시 Doppler `prd` config에서 `NEXT_PUBLIC_*` 시크릿을 가져와 web 이미지에 build-arg로 주입합니다. GitHub repo Settings → Secrets and variables → Actions 에 다음을 등록해야 합니다:

- `DOPPLER_TOKEN_PRD` — Doppler `api-platform/prd` config의 read-only service token

### 신규 시크릿 추가

1. Doppler 대시보드 (또는 `doppler secrets set KEY=value --config dev`) 에 추가
2. `apps/api/.env.example` 또는 `apps/web/.env.example` 에 키 이름만 문서화 (값은 placeholder)
3. **런타임 시크릿**은 추가 작업 없음. `compose-doppler.sh` 가 다음 실행 시 자동으로 `.env.runtime` 에 포함시켜 컨테이너로 주입.
4. **빌드 타임 `NEXT_PUBLIC_*`** 만 별도 처리 필요 — Next.js가 빌드 시점에 클라이언트 번들로 인라인하므로:
   - `apps/web/Dockerfile` 의 `ARG`/`ENV` 에 키 추가
   - `.github/workflows/docker-build.yml` 의 build-args에 키 추가
5. 컨테이너 시작 시 새 변수가 필요한 경우 컨테이너 재시작만으로 반영 (`./scripts/compose-doppler.sh up -d --force-recreate`).
6. **컨테이너 환경변수 이름 매핑**이 필요한 경우 (예: `API_DB_USER` → `POSTGRES_USER`) `docker-compose.prod.yml` 의 `environment:` 블록에 `${VAR}` 형태로 추가.
