import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StripeConfigResponseDto } from './dto/profile.dto.js';

/**
 * Stripe 공개 설정.
 *
 * **인증을 걸지 않는다.** publishable 키는 «공개»가 설계 의도이고, 이미 플랫폼 웹앱의
 * 스크립트 번들에 그대로 들어 있다. 감추는 시늉을 하면 연동하는 쪽만 번거로워진다.
 *
 * 이 엔드포인트가 있는 이유: 플랫폼이 Merchant of Record 라 Stripe 계정이 하나뿐인데,
 * 연동 서비스마다 같은 키를 자기 환경변수로 복사해 두면 **test→live 전환 때 조용히 깨진다**
 * (플랫폼만 바꾸고 서비스는 옛 키로 남는다). 키의 출처를 여기 하나로 둔다.
 */
@ApiTags('결제')
@Controller('stripe')
export class StripeConfigController {
  @Get('config')
  @ApiOperation({
    summary: 'Stripe 공개 설정 조회 (인증 불필요)',
    description:
      '브라우저에서 Stripe.js 를 초기화할 때 쓰는 publishable 키를 돌려줘요. ' +
      '연동 서비스는 이 값을 자기 환경변수로 복사하지 말고 여기서 받아 쓰세요 — ' +
      'test/live 전환이 플랫폼 한 곳에서 끝나요. ' +
      '거의 바뀌지 않는 값이라 호출하는 쪽에서 캐시해도 괜찮아요.',
  })
  @ApiOkResponse({ type: StripeConfigResponseDto })
  getConfig(): StripeConfigResponseDto {
    // 🔴 이름이 `NEXT_PUBLIC_` 인 것은 오타가 아니다. 이 값은 원래 web 이 쓰려고 넣어 둔
    //    것이고, 단일 이미지가 doppler run 으로 api·web 을 함께 띄우므로(docker-entrypoint.sh)
    //    api 프로세스도 같은 env 를 받는다. 같은 값을 `API_` 이름으로 하나 더 만들면
    //    이 엔드포인트가 없애려는 «복사본 표류»를 플랫폼 안에서 되풀이하게 된다.
    //    web 과 api 를 따로 배포하게 되면 그때 `API_STRIPE_PUBLISHABLE_KEY` 를 채우면 된다.
    const publishableKey = (
      process.env.API_STRIPE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    )?.trim();
    if (!publishableKey) {
      // 설정 누락을 200 + 빈 문자열로 뭉개면 연동 쪽에서는 «결제칸이 안 뜬다»로만 보인다.
      // 무엇이 없는지 분명히 알려 줘야 고칠 수 있다.
      throw new ServiceUnavailableException(
        'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY 가 설정되지 않았어요.',
      );
    }
    return {
      publishableKey,
      livemode: publishableKey.startsWith('pk_live_'),
    };
  }
}
