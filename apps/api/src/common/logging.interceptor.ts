import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const res = context.switchToHttp().getResponse();

    return next.handle().pipe(
      tap((data) => {
        // pino-http의 res 시리얼라이저가 응답 완료 시 읽을 수 있도록 raw res에 저장
        const raw = res.raw ?? res;
        raw._responseBody = data;
      }),
    );
  }
}
