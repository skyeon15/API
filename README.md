# 에케 API EKE API

## 실제 결제수단 기록

승인된 거래의 `actualPaymentMethod`에 결제 당시의 수단·카드사·할부 정보를 저장합니다.
기존 `payMethod`는 연동 방식(`billing`, `payapp`, `stripe` 등)이므로 실제 결제수단과 구분합니다.

```json
{
  "actualPaymentMethod": {
    "type": "CARD",
    "cardName": "현대",
    "installmentMonths": 0
  }
}
```

- `type`: `CARD`, `TRANSFER`, `VIRTUAL_ACCOUNT`, `MOBILE`, `EASY_PAY` 등 실제 승인 수단
- `provider`: 간편결제 사업자(`NAVERPAY`, `KAKAOPAY`, `PAYCO` 등)
- `cardName`: PG가 제공한 카드사명. Stripe 카드 네트워크는 별도 `cardBrand`에 기록
- `cardType`: 제공되는 경우 `CREDIT` 또는 `DEBIT`
- `installmentMonths`: `0`은 일시불, 양수는 할부 개월 수. 정보가 없으면 생략
- `fundingType`: 간편결제 내부 수단이 확인되는 경우 `CARD`, `TRANSFER`, `CHARGE`

페이앱 승인 통보·등록 카드 청구 성공, Stripe 승인된 Charge에서 기록합니다.
취소·부분취소 후에도 승인 당시 정보를 보존하며, 실패·대기 상태를 실제 결제수단으로 추정하지 않습니다.
거래 조회(`/profile/payments/transactions`, `/sso/stripe/transactions`, 서비스 거래 조회)와 서비스 콜백에 제공합니다.
카드번호·빌링키·PG 인증값은 이 필드에 포함하지 않습니다.

`1791158400000-AddActualPaymentMethod` 마이그레이션은 nullable JSONB 열을 추가하고,
기존 저장된 승인 통보 또는 성공한 Stripe 응답에서 확인되는 값만 복원합니다.
현재 저장 카드 정보로 과거 결제를 추정하지 않으며 상태·결제 금액·취소 금액은 변경하지 않습니다.
마이그레이션은 API 부팅 때 자동 적용됩니다. 로컬 검증은 아래 명령으로 실행합니다.

```bash
node scripts/verify-payment-metadata.mjs
# 별도 PostgreSQL 스키마에서 실제 마이그레이션·백필·재실행 검증
doppler run --project api-platform --config dev -- node scripts/verify-payment-metadata.mjs --db
```

## 이메일 인증코드 로그인

로그인 화면에서 이메일로 6자리 코드를 받아 소셜 계정 없이 가입·로그인할 수 있습니다.
기존 회원은 기존 로그인 수단으로 로그인한 뒤 **프로필 → 이메일 로그인**에서 이메일을 인증해 연결합니다.
연락처 이메일과 인증한 로그인 이메일은 별도로 저장되며, 기존 프로필 이메일만으로 계정을 자동 연결하지 않습니다.
이메일 연결 변경·해제 시 해당 계정의 이메일 로그인 리프레시 토큰을 폐기하고, 마지막 로그인 수단의 해제는 차단합니다.

Resend는 메일 발송을 담당합니다. 코드 발급·검증은 API가 처리합니다.

- 코드: 5분 유효, 최대 5회 입력, 1회 사용. 새 코드 요청 시 이전 코드는 무효화됩니다.
- 발송 제한: 이메일당 60초 간격·시간당 5회, IP당 시간당 30회, 전체 시간당 300회(설정 가능).
- 검증 제한: IP당 10분에 30회. Redis Lua로 동시 요청을 처리하며 Redis 장애 시 인증을 거부합니다.
- 코드 원문은 저장하지 않고 HMAC으로 보관합니다. 요청한 브라우저·목적·연결 대상 계정에 인증을 묶습니다.
- 이메일 로그인은 영구 쿠키 없이 최대 1시간 유지합니다. 갱신해도 만료 시간이 연장되지 않습니다.
  연동 서비스가 발급받는 SSO 토큰의 수명은 해당 SSO 정책을 따릅니다.

Doppler의 `api-platform` config에 아래 값을 설정합니다. 키는 저장소나 프론트엔드에 넣지 않습니다.

| 환경변수 | 용도 |
| --- | --- |
| `API_RESEND_API_KEY` | Resend 발송 키 (`RESEND_API_KEY`도 대체 이름으로 지원) |
| `API_RESEND_FROM` | 검증된 발신 주소. 예: `파란대나무숲 <no-reply@bbforest.net>` |
| `API_EMAIL_OTP_SECRET` | 32자 이상의 임의 HMAC 키. 생략 시 `API_JWT_SECRET` 사용 |
| `API_EMAIL_OTP_HOURLY_LIMIT` | 전체 시간당 발송 한도. 기본 300 |
| `API_WEB_URL` | 이메일 인증 요청을 허용할 웹 출처. 실제 브라우저 주소와 일치해야 함 |

키·발신 주소·충분한 길이의 HMAC 키가 없으면 이메일 인증을 비활성화합니다.
`1792800000000-AddEmailLogin` 마이그레이션은 API 부팅 시 자동 적용되며, 기존 이메일을 로그인 수단으로 자동 전환하지 않습니다.

검증에는 운영 DB·Redis·Resend 키가 필요하지 않습니다. 아래 스크립트는 Docker의
임시 PostgreSQL/Redis 컨테이너를 로컬 포트로 실행하고 종료 시 제거합니다. 메일은 대체 응답으로 검증합니다.

```bash
node scripts/verify-email-login.mjs
node scripts/verify-social-login.mjs
npm run typecheck --workspace=apps/web
```

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

`docker-build.yml` 이 빌드 시 Doppler `prd` config에서 `NEXT_PUBLIC_*` 시크릿을 가져와 단일 이미지(`ghcr.io/skyeon15/api`, API+web 통합)에 build-arg로 주입합니다. GitHub repo Settings → Secrets and variables → Actions 에 다음을 등록해야 합니다:

- `DOPPLER_TOKEN_PRD` — Doppler `api-platform/prd` config의 read-only service token

### 신규 시크릿 추가

1. Doppler 대시보드 (또는 `doppler secrets set KEY=value --config dev`) 에 추가
2. `apps/api/.env.example` 또는 `apps/web/.env.example` 에 키 이름만 문서화 (값은 placeholder)
3. **런타임 시크릿**은 추가 작업 없음. `compose-doppler.sh` 가 다음 실행 시 자동으로 `.env.runtime` 에 포함시켜 컨테이너로 주입.
4. **빌드 타임 `NEXT_PUBLIC_*`** 만 별도 처리 필요 — Next.js가 빌드 시점에 클라이언트 번들로 인라인하므로:
   - 루트 `Dockerfile` 의 `ARG`/`ENV` 에 키 추가
   - `.github/workflows/docker-build.yml` 의 build-args에 키 추가
   - (로컬 `build.sh` 는 Doppler의 `NEXT_PUBLIC_*` 를 자동으로 모두 build-arg로 전달)
5. 컨테이너 시작 시 새 변수가 필요한 경우 컨테이너 재시작만으로 반영 (`./scripts/compose-doppler.sh up -d --force-recreate`).
6. **컨테이너 환경변수 이름 매핑**이 필요한 경우 (예: `API_DB_USER` → `POSTGRES_USER`) `docker-compose.prod.yml` 의 `environment:` 블록에 `${VAR}` 형태로 추가.
