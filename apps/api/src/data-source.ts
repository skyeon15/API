import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ApiKey } from './admin/entities/api-key.entity.js';
import { User } from './users/entities/user.entity.js';
import { PaymentMethod } from './users/entities/payment-method.entity.js';
import { PayappSeller } from './users/entities/payapp-seller.entity.js';
import { VerificationCode } from './users/entities/verification-code.entity.js';
import { RefreshToken } from './auth/entities/refresh-token.entity.js';
import { AuditLog } from './audit/entities/audit-log.entity.js';
import { AlimtalkChannel } from './alimtalk/entities/channel.entity.js';
import { AlimtalkTemplate } from './alimtalk/entities/template.entity.js';
import { AlimtalkMessage } from './alimtalk/entities/message.entity.js';
import 'dotenv/config';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.API_DB_HOST || 'localhost',
  port: parseInt(process.env.API_DB_PORT || '5432', 10),
  username: process.env.API_DB_USER || 'pds_user',
  password: process.env.API_DB_PASSWORD || 'pds_password',
  database: process.env.API_DB_NAME || 'pds_api',
  synchronize: false,
  logging: true,
  entities: [ApiKey, User, PaymentMethod, PayappSeller, VerificationCode, RefreshToken, AuditLog, AlimtalkChannel, AlimtalkTemplate, AlimtalkMessage],
  migrations: ['src/migrations/*.ts'],
  migrationsTransactionMode: 'each',
  subscribers: [],
});
