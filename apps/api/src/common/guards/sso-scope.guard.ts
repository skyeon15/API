import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { SSO_SCOPES_KEY } from '../decorators/sso-scope.decorator.js';
import { isSsoToken } from '../utils/session-token.util.js';

/**
 * 연동 서비스가 **사용자 자격으로** 부르는 문.
 *
 * `ApiKeyOrSessionGuard` 는 `typ:'sso'` 토큰을 «세션이 아니다»라며 거부한다 —
 * 연동 서비스가 받은 토큰을 쿠키에 실어 본인 전용 API 를 여는 것을 막기 위해서다.
 * 그 결과 **SSO 토큰으로 열린 문이 하나도 없었다**(`isSsoToken` 은 쓰이는 곳이 없었다).
 * 여기가 그 문이고, 열쇠는 **동의받은 scope** 다. 토큰에 scope 가 없으면 못 들어온다.
 *
 * 🔴 서비스 API 키는 여기로 들어올 수 없다. 최종 사용자의 카드를 서비스 키로 다루는 것은
 *    플랫폼이 금지한 패턴이라(카드가 키 소유자 한 명에게 몰린다) 애초에 길을 내지 않는다.
 */
@Injectable()
export class SsoScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();

    const authHeader: string | undefined = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('SSO 액세스 토큰이 필요합니다.');
    }

    let payload: any;
    try {
      payload = this.jwtService.verify(authHeader.slice('Bearer '.length));
    } catch {
      throw new UnauthorizedException('액세스 토큰이 유효하지 않습니다.');
    }
    if (!isSsoToken(payload)) {
      throw new UnauthorizedException(
        '연동 서비스에 발급된 액세스 토큰이 아닙니다.',
      );
    }

    const required =
      this.reflector.getAllAndOverride<string[]>(SSO_SCOPES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const granted = String(payload.scope ?? '').split(' ').filter(Boolean);
    const missing = required.filter((s) => !granted.includes(s));
    if (missing.length) {
      throw new ForbiddenException(
        `동의받지 않은 scope 입니다: ${missing.join(', ')}`,
      );
    }

    req['userId'] = payload.sub;
    req['ssoClientId'] = payload.aud;
    return true;
  }
}
