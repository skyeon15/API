import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { AdminModule } from '@adminjs/nestjs';
import { ApiKey } from './entities/api-key.entity.js';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import AdminJS from 'adminjs';
import { Database, Resource as TypeORMResource } from '@adminjs/typeorm';
import { SERVICE_REGISTRY } from '../common/service-registry.js';
import { randomBytes } from 'crypto';

// Register adapter globally
AdminJS.registerAdapter({ Database, Resource: TypeORMResource });

@Module({
  imports: [
    TypeOrmModule.forFeature([ApiKey]),
    AdminModule.createAdminAsync({
      inject: [getDataSourceToken()],
      useFactory: (dataSource: DataSource) => {
        return {
          adminJsOptions: {
            rootPath: '/skyeon15',
            databases: [dataSource],
            resources: [
              {
                // Explicitly use the Resource class to bypass adapter discovery
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
})
export class AdminPanelModule {}
