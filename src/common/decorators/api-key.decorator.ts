import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiKey } from '../../admin/entities/api-key.entity.js';

export const CurrentApiKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ApiKey => {
    return ctx.switchToHttp().getRequest().apiKey;
  },
);
