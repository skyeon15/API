import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { AdminModule } from '@adminjs/nestjs';
import { ApiKey } from './entities/api-key.entity.js';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import AdminJS, { ComponentLoader } from 'adminjs';
import { Database, Resource as TypeORMResource } from '@adminjs/typeorm';
import { SERVICE_REGISTRY } from '../common/service-registry.js';
import { randomBytes } from 'crypto';
import { resolve } from 'path';
import { User } from '../users/entities/user.entity.js';
import { AuditLog, AuditAction, AuditResource } from '../audit/entities/audit-log.entity.js';
import { AlimtalkModule } from '../alimtalk/alimtalk.module.js';
import { AdminChannelController } from './admin-channel.controller.js';

// Register adapter globally
AdminJS.registerAdapter({ Database, Resource: TypeORMResource });

const componentLoader = new ComponentLoader();
const Components = {
  ChannelWizardPage: componentLoader.add(
    'ChannelWizardPage',
    resolve('./src/admin/components/ChannelWizardPage'),
  ),
};

@Module({
  imports: [
    TypeOrmModule.forFeature([ApiKey, User, AuditLog]),
    AlimtalkModule,
    AdminModule.createAdminAsync({
      inject: [getDataSourceToken()],
      useFactory: (dataSource: DataSource) => {
        const auditRepo = dataSource.getRepository(AuditLog);
        const logAudit = (params: { action: AuditAction; resource: AuditResource; resourceId: string | number; before?: Record<string, any>; after?: Record<string, any> }) =>
          auditRepo.save(auditRepo.create({ ...params, resourceId: String(params.resourceId) }));
        return {
          adminJsOptions: {
            rootPath: '/skyeon15',
            componentLoader,
            databases: [dataSource],
            pages: {
              'channel-wizard': {
                navigation: { name: '채널 등록', icon: 'Plus' },
                handler: async () => ({}),
                component: Components.ChannelWizardPage,
              },
            },
            resources: [
              {
                resource: new TypeORMResource(User),
                options: {
                  navigation: { name: '사용자', icon: 'User' },
                  properties: {
                    name: { description: '사용자 이름이에요.' },
                    phone: { description: '연락처 전화번호예요.' },
                    company: { description: '소속 회사명이에요.' },
                    createdAt: { description: '계정 생성 시각이에요.' },
                    updatedAt: { description: '정보가 마지막으로 변경된 시각이에요.' },
                  },
                  actions: {
                    new: {
                      after: async (response, _request, context) => {
                        if (context.record?.isValid()) {
                          const id = parseInt(String(context.record.id()));
                          const created = await dataSource.getRepository(User).findOne({ where: { id } });
                          await logAudit({ action: AuditAction.CREATE, resource: AuditResource.USER, resourceId: id, after: created ?? undefined });
                        }
                        return response;
                      },
                    },
                    edit: {
                      before: async (request) => {
                        const id = request.params?.recordId;
                        if (id) {
                          (request as any)._before = await dataSource.getRepository(User).findOne({ where: { id: parseInt(id) } });
                        }
                        return request;
                      },
                      after: async (response, request, context) => {
                        if (context.record?.isValid()) {
                          const id = parseInt(String(context.record.id()));
                          const updated = await dataSource.getRepository(User).findOne({ where: { id } });
                          await logAudit({ action: AuditAction.UPDATE, resource: AuditResource.USER, resourceId: id, before: (request as any)._before ?? undefined, after: updated ?? undefined });
                        }
                        return response;
                      },
                    },
                    delete: {
                      before: async (request) => {
                        const id = request.params?.recordId;
                        if (id) {
                          (request as any)._before = await dataSource.getRepository(User).findOne({ where: { id: parseInt(id) } });
                        }
                        return request;
                      },
                      after: async (response, request, context) => {
                        const id = context.record?.id() ?? request.params?.recordId ?? '';
                        await logAudit({ action: AuditAction.DELETE, resource: AuditResource.USER, resourceId: id, before: (request as any)._before ?? undefined });
                        return response;
                      },
                    },
                  },
                },
              },
              {
                resource: new TypeORMResource(AuditLog),
                options: {
                  navigation: { name: '감사 로그', icon: 'DocumentText' },
                  actions: {
                    new: { isAccessible: false },
                    edit: { isAccessible: false },
                    delete: { isAccessible: false },
                    bulkDelete: { isAccessible: false },
                  },
                  properties: {
                    before: { type: 'mixed' },
                    after: { type: 'mixed' },
                  },
                },
              },
              {
                resource: new TypeORMResource(ApiKey),
                options: {
                  navigation: { name: '관리', icon: 'Settings' },
                  actions: {
                    new: {
                      before: async (request) => {
                        if (!request.payload?.key) {
                          request.payload.key = randomBytes(32).toString('hex');
                        }
                        return request;
                      },
                      after: async (response, _request, context) => {
                        if (context.record?.isValid()) {
                          const id = parseInt(String(context.record.id()));
                          const created = await dataSource.getRepository(ApiKey).findOne({ where: { id } });
                          await logAudit({ action: AuditAction.CREATE, resource: AuditResource.API_KEY, resourceId: id, after: created ?? undefined });
                        }
                        return response;
                      },
                    },
                    edit: {
                      before: async (request) => {
                        const id = request.params?.recordId;
                        if (id) {
                          (request as any)._before = await dataSource.getRepository(ApiKey).findOne({ where: { id: parseInt(id) } });
                        }
                        return request;
                      },
                      after: async (response, request, context) => {
                        if (context.record?.isValid()) {
                          const id = parseInt(String(context.record.id()));
                          const updated = await dataSource.getRepository(ApiKey).findOne({ where: { id } });
                          await logAudit({ action: AuditAction.UPDATE, resource: AuditResource.API_KEY, resourceId: id, before: (request as any)._before ?? undefined, after: updated ?? undefined });
                        }
                        return response;
                      },
                    },
                    delete: {
                      before: async (request) => {
                        const id = request.params?.recordId;
                        if (id) {
                          (request as any)._before = await dataSource.getRepository(ApiKey).findOne({ where: { id: parseInt(id) } });
                        }
                        return request;
                      },
                      after: async (response, request, context) => {
                        const id = context.record?.id() ?? request.params?.recordId ?? '';
                        await logAudit({ action: AuditAction.DELETE, resource: AuditResource.API_KEY, resourceId: id, before: (request as any)._before ?? undefined });
                        return response;
                      },
                    },
                  },
                  properties: {
                    key: {
                      isTitle: true,
                      isDisabled: true,
                      description: '저장 시 자동으로 생성돼요. 직접 입력할 수 없어요.',
                    },
                    name: {
                      description: '이 API 키를 식별할 이름이에요. (예: 서비스명, 사용자명)',
                    },
                    isActive: {
                      description: '비활성화하면 해당 키로 API 요청이 즉시 차단돼요.',
                    },
                    allowedServices: {
                      description: '이 키로 접근을 허용할 서비스를 선택하세요. 선택하지 않은 서비스는 403 오류가 반환돼요.',
                      availableValues: SERVICE_REGISTRY.map(({ value, label }) => ({ value, label })),
                    },
                    createdAt: {
                      description: '키가 처음 생성된 시각이에요.',
                    },
                    updatedAt: {
                      description: '키 정보가 마지막으로 변경된 시각이에요.',
                    },
                  },
                },
              },
            ],
            branding: {
              companyName: '파란대나무숲',
              logo: '/public/logo.png',
              favicon: '/public/favicon.svg',
            },
          },
        };
      },
    }),
  ],
  controllers: [AdminChannelController],
})
export class AdminPanelModule {}
