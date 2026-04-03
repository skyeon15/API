import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import ipaddr from 'ipaddr.js';

@Injectable()
export class IpRestrictionGuard implements CanActivate {
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

    const clientIp = request.ip || request.connection.remoteAddress;

    if (!clientIp) {
      throw new NotFoundException();
    }

    if (this.isIpAllowed(clientIp)) {
      return true;
    }

    throw new NotFoundException();
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
