import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKey } from '../../admin/entities/api-key.entity.js';
import { SERVICE_KEY } from '../decorators/service.decorator.js';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRepository(ApiKey)
    private apiKeyRepository: Repository<ApiKey>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('API 키가 없거나 형식이 올바르지 않아요.');
    }

    const key = authHeader.split(' ')[1];
    const apiKey = await this.apiKeyRepository.findOne({
      where: { key, isActive: true },
    });

    if (!apiKey) {
      throw new UnauthorizedException('유효하지 않거나 비활성화된 API 키예요.');
    }

    const requiredService = this.reflector.getAllAndOverride<string>(SERVICE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no service is specified, allow access (public API within a protected controller would need explicit 'public' tag, but here we assume if @Service is missing, we check if it's required)
    if (!requiredService) {
      return true;
    }

    if (!apiKey.allowedServices || !apiKey.allowedServices.includes(requiredService)) {
      throw new ForbiddenException(`해당 서비스('${requiredService}')에 대한 접근 권한이 없는 API 키예요.`);
    }

    request.apiKey = apiKey;
    return true;
  }
}
