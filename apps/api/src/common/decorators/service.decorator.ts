import { SetMetadata } from '@nestjs/common';

export const SERVICE_KEY = 'service';
export const Service = (serviceName: string) =>
  SetMetadata(SERVICE_KEY, serviceName);
