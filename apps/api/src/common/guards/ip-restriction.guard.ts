import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import ipaddr from 'ipaddr.js';

@Injectable()
export class IpRestrictionGuard implements CanActivate {
  private readonly logger = new Logger(IpRestrictionGuard.name);

  private readonly allowedRanges = [
    '100.64.0.0/10', // Tailscale IPv4
    'fd7a:115c:a1e0::/48', // Tailscale IPv6
    '127.0.0.1/32', // localhost IPv4
    '::1/128', // localhost IPv6
  ];

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // Only apply restriction to /skyeon15 routes
    if (!request.url.startsWith('/skyeon15')) {
      return true;
    }

    const clientIp = this.getClientIp(request);
    const allowed = !!clientIp && this.isIpAllowed(clientIp);

    // 검증용: /skyeon15 접근 시 원본 헤더와 판정 결과를 남겨 실제 클라이언트 IP가 제대로 잡히는지 확인한다.
    this.logger.log(
      `[admin-access] url=${request.url} clientIp=${clientIp ?? 'none'} ` +
        `xff=${request.headers?.['x-forwarded-for'] ?? 'none'} ` +
        `remoteAddress=${request.connection?.remoteAddress ?? 'none'} allowed=${allowed}`,
    );

    if (!allowed) {
      throw new NotFoundException();
    }
    return true;
  }

  // web→api 프록시가 같은 컨테이너 localhost에서 호출하므로 remoteAddress는 항상 127.0.0.1이다.
  // 실제 클라이언트 IP는 프록시가 붙인 X-Forwarded-For의 맨 앞(최초 클라이언트) 항목을 사용한다.
  private getClientIp(request: any): string | undefined {
    const xff = request.headers?.['x-forwarded-for'];
    if (xff) {
      const raw = Array.isArray(xff) ? xff[0] : xff;
      const first = String(raw).split(',')[0]?.trim();
      if (first) return first;
    }
    return request.ip || request.connection?.remoteAddress;
  }

  private isIpAllowed(ipString: string): boolean {
    try {
      // Normalize IPv6-mapped IPv4 addresses (e.g., ::ffff:1.2.3.4)
      let addr = ipaddr.parse(ipString);
      if (
        addr.kind() === 'ipv6' &&
        (addr as ipaddr.IPv6).isIPv4MappedAddress()
      ) {
        addr = (addr as ipaddr.IPv6).toIPv4Address();
      }

      for (const range of this.allowedRanges) {
        const [rangeIp, bits] = range.split('/');
        const cidrAddr = ipaddr.parse(rangeIp);
        const bitCount = parseInt(bits, 10);

        if (addr.kind() === cidrAddr.kind()) {
          if (addr.kind() === 'ipv4') {
            if (
              (addr as ipaddr.IPv4).match(cidrAddr as ipaddr.IPv4, bitCount)
            ) {
              return true;
            }
          } else if (addr.kind() === 'ipv6') {
            if (
              (addr as ipaddr.IPv6).match(cidrAddr as ipaddr.IPv6, bitCount)
            ) {
              return true;
            }
          }
        }
      }
    } catch (error) {
      console.error('IP Validation error:', error);
      return false;
    }

    return false;
  }
}
