import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKey } from '../../admin/entities/api-key.entity.js';
import { SERVICE_KEY } from '../decorators/service.decorator.js';

/**
 * Accepts either:
 *   - A valid Bearer API key with the required service permission, or
 *   - A valid session cookie (access_token JWT), or
 *   - A valid Bearer JWT.
 *
 * Sets request.apiKey when authenticated via API key.
 * Sets request.userId when authenticated via session/JWT.
 */
@Injectable()
export class ApiKeyOrSessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    const requiredService = this.reflector.getAllAndOverride<string>(SERVICE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // 1. Try Bearer token (API Key or JWT)
    const authHeader: string | undefined = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];

      // 1-a. Try as API Key
      const apiKey = await this.apiKeyRepository.findOne({
        where: { key: token, isActive: true },
      });
      if (apiKey) {
        if (!requiredService || apiKey.allowedServices?.includes(requiredService)) {
          req.apiKey = apiKey;
          req['userId'] = apiKey.userId;
          return true;
        }
      }

      // 1-b. Try as JWT
      try {
        const payload: { sub: number } = this.jwtService.verify(token);
        req['userId'] = payload.sub;
        return true;
      } catch {
        // Not a valid JWT, fall through
      }
    }

    // 2. Try session cookie
    const cookieToken: string | undefined = req.cookies?.access_token;
    if (cookieToken) {
      try {
        const payload: { sub: number } = this.jwtService.verify(cookieToken);
        req['userId'] = payload.sub;
        return true;
      } catch {
        // invalid token
      }
    }

    throw new UnauthorizedException('로그인 또는 유효한 API 키가 필요합니다.');
  }
}
