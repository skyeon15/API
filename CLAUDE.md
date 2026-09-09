# 파란대나무숲 API 플랫폼 (pds-monorepo)

여러 자체 서비스가 공용으로 쓰는 중앙 API 플랫폼. NestJS API + Next.js 관리웹 모노레포(turbo).

## 구조

- `apps/api` — NestJS (**ESM**), 포트 10151. 주요 모듈: `users`(프로필·결제), `auth`, `admin`(API 키), `alimtalk`, `audit`, `common`(가드·유틸), `migrations`
- `apps/web` — Next.js 15, 포트 10150. `/api/*`를 API(10151)로 리버스프록시(`next.config.ts` rewrites). 브라우저는 항상 상대경로 `/api/*` 호출
- 운영: **단일 이미지**(api+web 동시 구동, `Dockerfile`+`docker-entrypoint.sh`) → `./build.sh`로 GHCR push → Coolify 배포. 공개 도메인 `https://platform.bbforest.net` (Cloudflare → Caddy → web 10150 → rewrite → api 10151)
- env는 **Doppler**(`api-platform` 프로젝트, prd/stg/dev). 컨테이너는 `doppler run`으로 부팅 시 주입. 컨벤션: API용 `API_` 접두사, web 클라이언트용 `NEXT_PUBLIC_`
- DB: PostgreSQL(PostGIS). TypeORM 마이그레이션 `apps/api/src/migrations/`, **부팅 시 자동 실행**(`migrationsRun: true`, each 트랜잭션)

## 인증 모델

`/profile/*`는 `ApiKeyOrSessionGuard`: **① Bearer API 키**(admin 발급, `allowedServices` 권한, `req.userId` = 키 소유자) 또는 **② 사용자 JWT/세션쿠키**(`req.userId` = 본인). 모든 결제·자원 접근은 이 userId 기준으로 귀속·권한검사.

### 통합 로그인(SSO/IdP) — `auth` 모듈

플랫폼이 다른 서비스들의 **OAuth2 authorization code 기반 IdP** 역할을 한다 (OIDC 유사, 표준 완전 준수는 아님):

- 엔드포인트: `GET /auth/authorize`(미로그인 시 web `/login`으로 리다이렉트) → `POST /auth/token`(code 교환, `client_secret` 필수, **redirect_uri 불일치 시 거부**) → `GET /auth/userinfo`. `id_token` 발급, scope별 클레임(profile/email/phone/address). **토큰 응답은 표준 snake_case가 아닌 camelCase**(`accessToken` 등) — 기성 OAuth 라이브러리 미호환
- Swagger(`/docs`)에는 **SSO 4개**(authorize/token/userinfo/client/:clientId, 태그 '통합 로그인(SSO)')만 노출. 자체 로그인(소셜/세션)은 `@ApiExcludeEndpoint`로 개별 제외
- 클라이언트 = `oauth_clients` 테이블: `redirectUris`, `allowedScopes`, 로그인 UI 브랜딩(`logoUrl`/`primaryColor`/`themeConfig`), `autoGrant`(내부 서비스 동의 생략). 사용자별 동의 이력은 `oauth_grants`
- 클라이언트 관리: 관리 콘솔 `/manage`의 SSO 섹션(**ADMIN role 전용**, `user.roles` 기준) ↔ API `/auth/clients` CRUD+시크릿 재발급(`sso-admin.controller.ts`, `ApiKeyOrSessionGuard`+`RolesGuard`, 문서 미노출). AdminJS(`/skyeon15`)에서도 가능하나 자동 발급 훅은 API 쪽에만 있음
- 로그인 수단: **소셜(카카오/네이버/구글, `user_social_accounts`)뿐이다.** 세션은 refresh token(`refresh_tokens`) + 쿠키. 전화 인증코드 로그인은 제거했다(아래) — 따라서 **가입 경로도 소셜 3종뿐이고, 소셜 계정을 잃으면 복구 경로가 없다.** 이메일 코드 로그인을 붙이는 것이 다음 과제
- **미구현**: `.well-known/openid-configuration`(discovery), PKCE — 클라이언트는 secret 보관 가능한 confidential(백엔드)이어야 함

#### 토큰 분리 — SSO 토큰은 세션이 아니다

예전엔 SSO 액세스 토큰과 브라우저 세션 토큰이 **둘 다 `{ sub }`** 여서 구분되지 않았다. 연동 서비스가
토큰 교환으로 받은 토큰을 `Cookie: access_token=...` 으로 붙이면 `/auth/me`·`/profile/*`(결제)가 그대로
열렸다 — scope 동의가 통째로 우회됐다.

- SSO 액세스 토큰에만 **`typ: 'sso'` · `aud`(clientId) · `scope`** 를 싣는다. 표식이 없으면 세션 토큰이다
- 쿠키 세션을 읽는 곳은 `isSessionToken()`(`common/utils/session-token.util.ts`)을 거친다 —
  컨트롤러의 `sessionUserId()`/`optionalSessionUserId()` 와 `ApiKeyOrSessionGuard` 두 군데뿐이다
  (쿠키 해석이 11곳에 복붙돼 있던 것을 헬퍼로 모았다. 만료 토큰이 500 대신 401 이 되는 것도 여기서 고쳤다 —
  웹의 자동 갱신은 401 에서만 동작한다)
- **리프레시 토큰도 갈라야 한다**: `refresh_tokens.clientId` 가 있으면 SSO 발급분이고
  `POST /auth/refresh`(세션 갱신)가 **거부**한다. 안 그러면 액세스 토큰 표식을 리프레시로 우회한다.
  연동 서비스는 만료 시 authorize 를 다시 태운다(SSO refresh 그랜트는 미구현)

#### userinfo — scope 반영 + 서비스 관리자

- `GET /auth/userinfo` 는 **토큰의 scope 만큼만** 내려준다. 예전엔 scope 를 무시하고 늘
  name/nickname/email/picture 를 줬고(동의 안 받은 이메일까지), 반대로 phone·address 는 동의를 받아도
  id_token 에만 있어 userinfo 로는 못 가져갔다. 지금은 `buildScopedClaims()` 를 id_token 과 공유한다
- **`isServiceAdmin`**: 그 사용자가 **토큰의 `aud` 서비스의 관리자**인지. 플랫폼 전체 ADMIN(`users.roles`)과
  별개다. 테이블 `oauth_client_admins`(clientId+userId 유니크). 지정은 플랫폼 ADMIN 만 —
  `/auth/clients/:id/admins` GET/POST/DELETE(`sso-admin.controller.ts`), 관리 콘솔은 `/manage` SSO 섹션의
  각 클라이언트 카드(`sso-client-admins.tsx`, 이메일로 추가). 서비스 관리자가 자기 서비스의 관리자를
  추가하는 것은 아직 안 된다

### 전화번호 — 로그인 수단이 아니라 연락처

전화번호는 **크리덴셜이 아니다.** 문자 인증 로그인(`/auth/request-code`, `/auth/verify-code`)과
프로필 번호 인증(`/auth/request-phone-code`, `/auth/verify-phone`)을 모두 제거했고,
이제 이름·이메일과 같은 편집 가능한 프로필 필드다. 인증 문자를 국내(알리고)로만 보낼 수 있어
해외 사용자가 가입을 못 끝내던 문제가 이 강등으로 함께 풀린다.

- **저장 형식**: 국내는 `01012345678`(알리고·PayApp이 국내 표기만 받는다), 해외는 E.164 `+14155550123`.
  즉 `+`로 시작하면 해외 번호다. 정규화·유효성은 `common/utils/phone.util.ts`의 `parsePhone` 한 곳에서만
  한다(libphonenumber-js). 웹은 `apps/web/lib/phone.ts`에서 같은 규칙으로 (국가, 국내표기) ↔ E.164를 오간다
- **수정**: `PATCH /auth/me`로 본인이 자유롭게 바꾼다. 형식 정규화 + 다른 계정 중복 확인만 하고,
  직접 입력한 번호는 `users.phoneVerified = false`로 내린다
- **`phoneVerified`**: 번호의 주인이 확인됐는지. **카카오·네이버가 넘겨준 번호만 true**이고 직접 입력은 false다.
  구글은 번호를 주지 않는다. 알림톡 발송·결제 귀속처럼 «주인이 확인된 번호»가 필요한 곳은 `phone` 유무가 아니라
  **이 컬럼**을 봐야 한다 — 미확인 번호로 알림톡을 쏘면 남의 번호로 가고 채널 제재로 이어진다
- `verification_codes` 테이블과 엔티티는 남겨 뒀다(쓰는 코드는 없음). 이메일 코드 로그인을 붙일 때 재사용할 것
- 해외 문자인증을 SignalWire로 붙이는 안은 검토 후 보류했다(관리 부담 대비 실익 없음). 전화번호 강등으로 불필요해졌다

### 가입 필수/선택 항목

판정은 `apps/web/lib/profile.ts` 의 `REQUIRED_PROFILE_FIELDS` 하나뿐이고 **프론트에서만 강제된다**
(`PATCH /auth/me` 도 `GET /auth/authorize` 도 완성도를 보지 않는다).

- **필수**: 이름 · 닉네임 · 성별 · 생년월일 · 전화번호 · 이메일
  - 닉네임은 비워 두면 **서버가 이름으로 채운다**(`updateProfile`) — 여기서 안 채우면 게이트를 못 벗어난다
  - 성별은 `M`/`F`/`U`(선택안함). 카카오가 성별 미동의면 `U` 로 채워져 그대로 통과한다
- **선택**: 주소(+우편번호·도시·주) · 상세주소 · 회사
- `/privacy` 제2조의 수집 항목을 이 목록과 맞춰 두었다. **필수 항목을 바꾸면 방침 문서도 같은 작업에서 고칠 것**
- `GET /auth/me` 는 엔티티가 아니라 `getMyProfile()` 화이트리스트를 내려준다 — `ci`·`stripeCustomerId`·`metadata` 제외

### 주소 — 국내는 다음 우편번호, 해외는 Stripe Address Element

`users`: `address`(도로명주소/line1) · `detailAddress`(동·호수/line2) · `zipCode` · **`addressCountry`(ISO-2) ·
`addressCity` · `addressState`**. 뒤 셋은 해외 주소용이다 — 국내 주소는 도로명주소 한 줄로 성립하지만
그 밖의 나라는 도시·주가 없으면 주소가 완성되지 않는다.

- **국내**: 다음 우편번호 검색(`lib/postcode.ts`). 손입력을 막고 `addressCountry='KR'`을 박는다
- **해외**: `register/_components/stripe-address-field.tsx` — **Stripe Address Element**. 이미 쓰는 Stripe.js라
  새 의존성이 없고 236개국 주소 형식·국가별 필수 항목 검증이 딸려 온다. 결제와 무관하게 단독 mount 하므로
  **`clientSecret` 이 필요 없다**(`<Elements stripe={getStripe()}>` 만으로 뜬다). 대신 **구글 주소 자동완성은
  꺼진다** — 자체 Google Maps Places 키를 `autocomplete.apiKey` 로 넘겨야 켜지고, 없어도 수동 입력은 정상이다
- 완료 판정은 나라마다 필수 칸이 달라 Stripe 의 `event.complete` 를 그대로 쓴다
- OIDC `address` 클레임에 `locality`(city) · `region`(state) · `country` 를 추가했다(표준 필드명)

## 결제 아키텍처 (PayApp + Stripe 공존)

- **PayApp**: `users/payment.service.ts`. **빌링키는 판매자 계정 귀속** — 카드는 (카드 × 판매자) 조합마다 `billRegist`로 발급·저장하고(`PaymentMethod.sellerId`, `merchantId = seller.sellerId`), 결제 판매자는 `paymentMethod.sellerId`가 결정. A 판매자로 발급한 빌링키를 B로 `billPay`하면 거부됨. 웹훅 `/webhooks/payapp`
- **Stripe (MoR)**: `users/stripe.service.ts`. 플랫폼이 Merchant of Record, **단일 키·Connect 미사용**. 정산 귀속은 `metadata.userId` + `PaymentTransaction.userId`. 빌링은 저장카드 off_session(Subscriptions 미사용). Link 활성화됨(PaymentElement에 자동 표시)
  - Stripe Customer는 사용자당 1개 재사용: `User.stripeCustomerId` (없으면 저장카드 레코드에서 백필 후 저장)
  - 웹훅 `/webhooks/stripe` — **일회성 결제의 PENDING→PAID 전환은 전적으로 웹훅 의존**. Stripe 대시보드에 엔드포인트 등록 필수, 서명 시크릿은 Doppler `API_STRIPE_WEBHOOK_SECRET`. rawBody 필요(`main.ts`에서 `rawBody: true`)
  - 공개 비즈니스 정보(영수증 연락처)·결제수단 활성화(capability)는 **본인 계정 API 수정 불가** — 대시보드에서만 변경
  - **결제수단 목록은 대시보드 설정을 따름**(card/link/kr_card/kakao_pay/naver_pay/amazon_pay). 코드에서 `payment_method_types`를 고정하지 않음
  - **리다이렉트형 수단(네이버페이 등)**: `confirmSetup`/`confirmPayment`에 `return_url` **필수**(`redirect: 'if_required'`여도 필수). 복귀 전용 라우트 `apps/web/src/app/stripe/return/page.tsx` — `setup_intent`면 카드저장 확정 API 호출, `payment_intent`면 결과 안내(거래 상태 반영은 웹훅). `next`는 내부 경로만 허용(오픈 리다이렉트 차단). 카드는 이탈이 없어 이 라우트를 거치지 않음
  - **네이버페이는 카드번호·브랜드를 주지 않음**. 확보 가능한 건 `type`/`buyer_id`(동일 계정 식별 해시)/`funding`(card|points) + SetupIntent의 `mandate`뿐 → `payment_methods.pmType`(varchar) + `pmDetail`(jsonb)에 저장. 카드는 `pmDetail`에 brand/last4/funding/country/exp*. 프론트는 `pmType !== 'card'`일 때 `cardNo`(`****`) 대신 funding·buyerId를 표기

### Stripe 공개키 배포 — `GET /stripe/config` (인증 불필요)

플랫폼이 MoR 라 Stripe 계정이 하나뿐이다. 연동 서비스가 publishable 키를 **자기 환경변수로
복사해 두면 test→live 전환 때 그쪽만 옛 키로 남아 조용히 깨진다.** 그래서 키의 출처를
API 한 곳에 두고 내려 준다(`users/stripe-config.controller.ts`).

- 값은 **기존 `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` 를 그대로 읽는다.** 단일 이미지가 doppler run 으로
  api·web 을 함께 띄우므로 api 프로세스도 같은 env 를 받는다 — 같은 값을 `API_` 이름으로 또 만들면
  이 엔드포인트가 없애려는 복사본 표류를 플랫폼 안에서 되풀이하게 된다
  (web 을 따로 배포하게 되면 그때 `API_STRIPE_PUBLISHABLE_KEY` 가 우선한다)

- 응답 `{ publishableKey, livemode }`. `livemode` 는 `pk_live_` 접두사로 판정
- 인증을 걸지 않는다 — publishable 키는 공개가 설계 의도이고 이미 web 번들에 들어 있다
- 키가 없으면 200 + 빈 문자열이 아니라 **503** 이다(연동 쪽에서 «결제칸이 안 뜬다»로만 보이면 못 고친다)

### 중앙집중 수납 모델 (핵심 설계)

다른 서비스들의 결제를 이 플랫폼이 **중앙집중으로 수납**한다:

- 각 서비스 = 플랫폼 사용자(API 키 소유자). 서비스가 자기 API 키로 결제 API를 호출하면 거래가 그 서비스의 userId로 귀속 → **서비스별 정산 집계가 자동**
- 일회성 결제 흐름: 서비스 백엔드 `POST /profile/stripe/payment-intent`(API 키) → `clientSecret`·`orderId`·`transactionId` 수령 → 서비스 프론트가 플랫폼 publishable key로 confirm → 플랫폼 웹훅이 PAID 동기화 → 서비스는 `GET /profile/payments/transactions?externalOrderId=...`로 조회
- **`externalOrderId`**: 서비스측 주문번호. payment-intent 생성 시 받아 Stripe metadata + `payment_transactions.externalOrderId`(인덱스)에 저장 — 서비스측 대사(reconciliation)용
- **금지 패턴**: 서비스 API 키로 **최종 사용자의 카드 저장·빌링** 대행. 모든 최종 사용자 카드가 키 소유자 1명의 Customer에 섞여 카드-사용자 매핑 오류 시 플랫폼이 오청구를 막을 수 없음. 최종 사용자 빌링이 필요해지면 `externalUserId` 단위 Customer 분리를 먼저 구현할 것
- 미구현(계획): 결제 완료 시 플랫폼→서비스 콜백 웹훅. 현재는 서비스가 거래 조회로 확인

### 연동 서비스 정기결제 — `/sso/payments/*` (`users/sso-payment.controller.ts`)

최종 사용자의 **빌링키**를 서비스의 판매자 계정으로 발급한다. 학생 구독처럼 «매달 자동으로
빠져나가는» 요금이 이 길을 쓴다.

- **왜 `/profile/payments` 로는 안 되나**: 거기는 «내 카드를 **내가 소유한** 판매자 계정에» 등록하는
  곳이다(`registerCard` 의 `seller.userId === user.id` 검사). 연동 서비스의 고객은 우리 판매자 계정을
  소유하지 않아 그 문으로는 못 들어온다. 여기서는 판매자를 **`oauth_clients.payappSellerId`** 로 정한다
  (관리 콘솔에서 서비스마다 걸어 준다. 비어 있으면 그 서비스는 정기결제를 못 쓴다)
- 발급 본체는 `payment.service.ts` 의 `registerCardOnSeller` / `chargeCardOnSeller` 다.
  판매자를 **고르는 규칙만** 둘로 갈렸을 뿐이라 본체는 한 벌로 둔다 — 소유권 검사는 부르는 쪽 몫

**자격이 셋이다. 부르는 시점이 다르기 때문이다.**

| | 자격 | 왜 |
|---|---|---|
| 카드 등록 `POST /sso/payments/methods` | **플랫폼 세션** | 카드번호를 받는 화면이 플랫폼에 있다(아래) |
| 조회·해지 `GET`/`DELETE .../methods` | **SSO 액세스 토큰 + `payment` scope** | 사용자가 그 서비스 화면을 보고 있다 |
| 청구 `POST /sso/payments/charge` | **서비스 API 키** | 매달 도는 일이라 사용자 토큰이 없다(15분짜리다) |

🔴 **카드번호는 플랫폼만 받는다.** PayApp `billRegist` 는 결제창이 아니라 카드번호를 그대로 받는
API 라, 연동 서비스가 자기 폼으로 받으면 그 서비스의 서버·로그가 카드정보 취급 범위(PCI)에 들어간다.
그래서 등록 화면을 플랫폼이 갖는다 — `apps/web/src/app/payments/register`
(`?client_id=&return_url=`). 서비스는 사용자를 그리로 보내고 복귀만 받는다.
**복귀 주소는 그 클라이언트의 `redirectUris` 와 출처가 같아야 한다**(`register-context` 가 검증).
검사 없이 되돌려 보내면 카드 등록 직후라는 가장 속기 쉬운 순간에 오픈 리다이렉트가 된다.

🔴 **청구가 «서비스 키로 최종 사용자 카드 대행» 금지에 걸리지 않는 이유**: 카드는 사용자 본인이
자기 세션으로 등록했고 `payment_methods.userId` 로 갈려 있다. 금지가 막는 것은 «키 소유자 한 명의
Customer 에 남의 카드가 섞이는 것»이다. 그래도 남의 서비스가 우리 고객을 긁지 못하게,
**키 소유자 = 그 클라이언트의 판매자 계정 주인**일 때만 통과시킨다.

🔴 **SSO 토큰으로 열린 문은 여기가 처음이다.** `SsoScopeGuard`(`common/guards/sso-scope.guard.ts`)가
`isSsoToken` 을 쓰는 유일한 곳이다 — 그전까지 그 헬퍼는 정의만 되어 있었다.
`ApiKeyOrSessionGuard` 는 여전히 SSO 토큰을 거부한다(scope 동의 우회 차단). 두 가드를 헷갈리지 말 것.

⚠️ **남은 구멍 — `allowedScopes` 가 검증되지 않는다.** `/auth/authorize` 는 요청받은 scope 를 그대로
토큰에 싣는다(`oauth_clients.allowedScopes` 는 저장·노출만 된다). 그래서 `payment` scope 는
지금 **클라이언트가 스스로 붙일 수 있다.** 클라이언트가 confidential(시크릿 보관)이고 우리가 직접
등록하는 것들뿐이라 당장의 구멍은 아니지만, 이 문을 진짜로 잠그려면 authorize 에서
allowedScopes 를 검사해야 한다. 🔴 지금 켜면 **allowedScopes 가 기본값(openid,profile)인 기존
클라이언트의 로그인이 깨진다** — DB 를 먼저 채우고 켤 것.

## 알림톡 발송 (중복 폭주 방지)

`alimtalk/alimtalk.service.ts`의 `send()`는 두 겹의 안전장치를 갖는다. 2026-08-20 장애(1분에 207건, 한 수신자 16통) 재발 방지용:

- **중복 차단**: 알리고를 호출하기 **전에** Redis `SET NX`로 선점한다. 키 = sha256(채널·템플릿코드·수신번호·치환 끝난 본문/타이틀/서브타이틀/버튼·예약시각), TTL = `API_ALIMTALK_DEDUP_TTL_SEC`(기본 60초, `0`이면 비활성). 선점 실패 시 **발송하지 않고 200 + `data.duplicated: true`**로 직전 결과를 그대로 돌려준다 — 4xx/5xx를 주면 호출측 재시도 루프가 계속 돌기 때문. 알리고 호출 자체가 실패하면 선점을 풀어 정당한 재시도를 허용한다
- **전송 성공 후 저장 실패는 500이 아니다**: 알리고 200을 받은 뒤의 DB 저장·감사로그 실패는 `logger.error`만 남기고 발송 성공 응답을 반환한다(`messageId: null`). 여기서 500을 던지면 이미 나간 메시지를 호출측이 재발송한다 — 실제 장애가 이 경로였다(엔티티에만 있던 `tplExtra`/`tplAdvert` 컬럼 누락 → INSERT 42703 → 500 → 재시도 폭주)
- `RedisService.setIfAbsent(key, value, ttl)`가 선점 프리미티브. Redis 장애 시 인메모리 폴백(단일 인스턴스 한정)

## 컨벤션·함정

- **Swagger CLI 플러그인 금지**: api가 ESM이라 플러그인이 require 주입으로 부팅을 깨뜨림. DTO + `@ApiProperty`로 직접 명세할 것
- 마이그레이션은 raw SQL `queryRunner.query()` 스타일, 파일명 `<timestamp>-<Name>.ts`, 클래스 `name` 필드 필수
- `amount`는 최소 화폐단위 정수(KRW는 원 단위 그대로), `currency`는 ISO 4217 소문자
- CORS 전 오리진 허용 + credentials — 외부 서비스 프론트 직접 호출 가능하나 장기적으로 화이트리스트 전환 검토
- **Stripe 카드저장은 웹훅이 프론트 콜백을 선점한다**: `setup_intent.succeeded` 웹훅(운영 배포본이 수신)이 프론트의 저장 확정 API보다 먼저 도착해 행을 만드는 경우가 많음(실측 3초). 따라서 **저장 로직을 프론트/dev에서만 고쳐도 반영되지 않고 운영 배포가 선행돼야 함**. `persistSavedCard`는 기존 행 발견 시 `pmDetail`이 비었으면 Stripe 조회로 자가 보정(`backfillPmDetail`)
- **PayApp `billPay` errno 20020 진단법**: generic한 "요청내용 오류"는 대부분 파라미터 문제가 아니라 **판매자 계정이 결제불가 상태**(정산정보/심사 미완료)인 것. reseller userid로 같은 요청을 쏴서 `70170`("결제가 가능한 상태가 아닙니다")이 뜨면 확정 — 코드 의심 말고 PayApp 관리자에서 해당 판매자 심사 상태 확인. (참고: userid 오류=70060, encBill 누락=70020, sub-account 카드등록(billRegist)은 심사 전에도 됨)

## 인프라 상태 (운영)

- **DB**: 신규 Coolify standalone PostGIS 컨테이너 `zemssj25k2tfzzveg81wm4mx`(coolify 네트워크). 구 공유 DB(`gaon-api` 서비스 내 `db`)에서 pg_dumpall로 전체 클러스터 이관(2026-06). Doppler prd `API_DB_HOST`가 zemssj를 가리키므로 재시작·재배포 모두 신규 DB 유지(실측 확인). 구 DB는 롤백용 보존, 다른 앱들(karaoke/hapbbi 등)은 아직 구 DB 사용
- **로컬 dev compose 함정**: dev는 `API_DB_HOST=10.0.9.1`(도커 호스트 게이트웨이 경유로 zemssj:5432 접속). compose down/up 시 네트워크 subnet이 바뀌면 끊기므로 `docker-compose.yml`에 `subnet: 10.0.9.0/24, gateway: 10.0.9.1` **고정**해 둠 — 제거 금지
- **Redis**: hapbbi prd와 공유하는 `r117jk9oigzlhghdo2g5l91u`로 전환 (username/password/db + `keyPrefix: 'api:'`, Doppler prd 설정 완료). 코드 변경 포함이라 재빌드+재배포로 반영되는 구조
