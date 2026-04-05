import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { AlimtalkChannel } from './entities/channel.entity.js';
import { AlimtalkTemplate, TemplateType } from './entities/template.entity.js';
import { AlimtalkMessage, MessageType } from './entities/message.entity.js';
import { AuditService, AuditContext } from '../audit/audit.service.js';
import {
  AuditAction,
  AuditResource,
} from '../audit/entities/audit-log.entity.js';
import { AligoProvider } from './aligo.provider.js';
import { generateTid } from '../common/utils/id.util.js';
import {
  GeneralResponseDto,
  SendResultDataDto,
  ResultCheckDataDto,
} from './dto/alimtalk-response.dto.js';
import { AlimtalkSendDto } from './dto/alimtalk-send.dto.js';

@Injectable()
export class AlimtalkService {
  private readonly logger = new Logger(AlimtalkService.name);

  constructor(
    @InjectRepository(AlimtalkChannel)
    private readonly channelRepo: Repository<AlimtalkChannel>,
    @InjectRepository(AlimtalkTemplate)
    private readonly templateRepo: Repository<AlimtalkTemplate>,
    @InjectRepository(AlimtalkMessage)
    private readonly messageRepo: Repository<AlimtalkMessage>,
    private readonly aligo: AligoProvider,
    private readonly auditService: AuditService,
  ) {}

  // ── 채널 ──────────────────────────────────────────────────────────────────

  async getChannels(userId?: string) {
    const where: FindOptionsWhere<AlimtalkChannel> = {};
    if (userId) where.createdByUserId = userId;
    const channels = await this.channelRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
    return channels.map(({ senderKey: _, ...rest }) => rest);
  }

  getCategories() {
    return this.aligo.getCategories();
  }

  requestChannelAuth(plusId: string, phone: string) {
    return this.aligo.requestChannelAuth(plusId, phone);
  }

  async addChannel(
    params: {
      plusId: string;
      authNum: string;
      phone: string;
      categoryCode: string;
      name: string;
    },
    ctx: AuditContext,
  ) {
    const aligoResult = await this.aligo.addChannel(params);
    const senderKey = aligoResult.info?.senderkey ?? aligoResult.senderkey;
    const channel = await this.channelRepo.save(
      this.channelRepo.create({
        senderKey,
        plusId: params.plusId,
        name: params.name,
        categoryCode: params.categoryCode,
        createdByUserId: ctx.userId,
      }),
    );

    await this.auditService.log({
      ...ctx,
      action: AuditAction.CREATE,
      resource: AuditResource.CHANNEL,
      resourceId: channel.id,
      after: channel,
    });
    return channel;
  }

  async updateChannel(
    id: string,
    dto: Partial<Pick<AlimtalkChannel, 'name' | 'isActive'>>,
    ctx: AuditContext,
  ) {
    const where: FindOptionsWhere<AlimtalkChannel> = { id };
    if (ctx.userId) where.createdByUserId = ctx.userId;

    const channel = await this.channelRepo.findOneBy(where);
    if (!channel) throw new NotFoundException('채널을 찾을 수 없어요.');

    const before = { ...channel };
    Object.assign(channel, dto);
    await this.channelRepo.save(channel);
    await this.auditService.log({
      ...ctx,
      action: AuditAction.UPDATE,
      resource: AuditResource.CHANNEL,
      resourceId: channel.id,
      before,
      after: channel,
    });
    return channel;
  }

  async syncAllChannelsFromVendor(ctx: AuditContext) {
    const result = await this.aligo.listChannels();
    const vendorChannels = result.list || result.data || [];
    let addedCount = 0;
    let updatedCount = 0;

    if (vendorChannels.length === 0) {
      this.logger.warn('동기화할 채널이 없습니다. (vendorChannels is empty)');
    }

    for (const vc of vendorChannels) {
      const senderKey = vc.senderKey;
      const plusId = vc.plusId;
      const name = vc.name;
      const categoryCode = vc.categoryCode;
      const status = vc.status;

      if (!senderKey) {
        this.logger.error({
          msg: 'Sync Error: senderKey를 찾을 수 없습니다.',
          vcKeys: Object.keys(vc),
          vc,
        });
        continue;
      }

      const existing = await this.channelRepo.findOneBy({
        senderKey: senderKey,
      });

      if (!existing) {
        const channel = await this.channelRepo.save(
          this.channelRepo.create({
            senderKey: senderKey,
            plusId: plusId,
            name: name,
            categoryCode: categoryCode,
            isActive: status === 'A',
            createdByUserId: ctx.userId,
          }),
        );
        addedCount++;

        this.logger.log(`Sync: 신규 채널 추가됨 [${senderKey}] ${name}`);

        await this.auditService.log({
          ...ctx,
          action: AuditAction.CREATE,
          resource: AuditResource.CHANNEL,
          resourceId: channel.id,
          after: channel,
        });
      } else {
        // 기존 채널 정보 업데이트
        const updateData = {
          name: name,
          categoryCode: categoryCode,
          isActive: status === 'A',
        };
        const hasChange =
          existing.name !== updateData.name ||
          existing.categoryCode !== updateData.categoryCode ||
          existing.isActive !== updateData.isActive;

        if (hasChange) {
          const before = { ...existing };
          Object.assign(existing, updateData);
          await this.channelRepo.save(existing);
          updatedCount++;

          this.logger.log(
            `Sync: 기존 채널 정보 업데이트됨 [${senderKey}] ${name}`,
          );

          await this.auditService.log({
            ...ctx,
            action: AuditAction.UPDATE,
            resource: AuditResource.CHANNEL,
            resourceId: existing.id,
            before,
            after: existing,
          });
        }
      }
    }

    return {
      total: vendorChannels.length,
      added: addedCount,
      updated: updatedCount,
    };
  }

  // ── 템플릿 ────────────────────────────────────────────────────────────────

  getTemplates(userId?: string, channelId?: string) {
    const where: FindOptionsWhere<AlimtalkTemplate> = { isRemoved: false };
    if (userId) where.createdByUserId = userId;
    if (channelId) where.channelId = channelId;

    return this.templateRepo.find({
      where,
      relations: ['channel'],
      order: { createdAt: 'DESC' },
    });
  }

  async getLiveTemplates(channelId?: string) {
    if (!channelId) return this.aligo.getTemplates();
    const channel = await this.channelRepo.findOneBy({ id: channelId });
    if (!channel) throw new NotFoundException('채널을 찾을 수 없어요.');
    return this.aligo.getTemplates(channel.senderKey);
  }

  async syncTemplates(channelId: string, ctx: AuditContext) {
    const where: FindOptionsWhere<AlimtalkChannel> = { id: channelId };
    if (ctx.userId) where.createdByUserId = ctx.userId;

    const channel = await this.channelRepo.findOneBy(where);
    if (!channel) throw new NotFoundException('채널을 찾을 수 없어요.');

    const result = await this.aligo.getTemplates(channel.senderKey);
    const templates: any[] = result.list ?? result.data ?? [];
    const typeMap: Record<string, TemplateType> = {
      BA: TemplateType.BASIC,
      EX: TemplateType.EMPHASIS,
      IM: TemplateType.IMAGE,
    };

    if (templates.length === 0) {
      this.logger.warn(
        `동기화할 템플릿이 없습니다. (senderKey: ${channel.senderKey})`,
      );
    }

    let syncedCount = 0;
    for (const tpl of templates) {
      const existing = await this.templateRepo.findOneBy({ code: tpl.code });
      const data = {
        name: tpl.name,
        content: tpl.content,
        title: tpl.title ?? null,
        subtitle: tpl.subtitle ?? null,
        buttons: tpl.buttons ?? null,
        inspStatus: tpl.inspStatus,
        type: typeMap[tpl.type] ?? TemplateType.BASIC,
      };
      if (existing) {
        if (ctx.userId && existing.createdByUserId !== ctx.userId) continue;
        await this.templateRepo.save(Object.assign(existing, data));
        syncedCount++;

        this.logger.log(`Sync: 템플릿 업데이트됨 [${tpl.code}] ${tpl.name}`);
      } else {
        await this.templateRepo.save(
          this.templateRepo.create({
            ...data,
            code: tpl.code,
            channelId,
            createdByUserId: ctx.userId,
            ...(tpl.createdAt ? { createdAt: new Date(tpl.createdAt) } : {}),
          }),
        );
        syncedCount++;

        this.logger.log(`Sync: 신규 템플릿 추가됨 [${tpl.code}] ${tpl.name}`);
      }
    }
    return { synced: syncedCount };
  }

  async createTemplate(
    dto: {
      channelId: string;
      name: string;
      type: TemplateType;
      content: string;
      title?: string;
      subtitle?: string;
      buttons?: Record<string, any>[];
    },
    ctx: AuditContext,
  ) {
    const where: FindOptionsWhere<AlimtalkChannel> = { id: dto.channelId };
    if (ctx.userId) where.createdByUserId = ctx.userId;

    const channel = await this.channelRepo.findOneBy(where);
    if (!channel) throw new NotFoundException('채널을 찾을 수 없어요.');

    const aligoResult = await this.aligo.addTemplate({
      senderKey: channel.senderKey,
      ...dto,
    });

    const entity = this.templateRepo.create({
      code: aligoResult.tpl_code,
      channelId: dto.channelId,
      name: dto.name,
      type: dto.type,
      content: dto.content,
      title: dto.title ?? null,
      subtitle: dto.subtitle ?? null,
      buttons: dto.buttons ?? null,
      inspStatus: 'REG',
      createdByUserId: ctx.userId ?? null,
    });
    const template = await this.templateRepo.save(entity);

    await this.auditService.log({
      ...ctx,
      action: AuditAction.CREATE,
      resource: AuditResource.TEMPLATE,
      resourceId: template.id,
      after: template,
    });
    return template;
  }

  async updateTemplate(
    code: string,
    dto: Partial<{
      name: string;
      content: string;
      title: string;
      subtitle: string;
      buttons: Record<string, any>[];
    }>,
    ctx: AuditContext,
  ) {
    const where: FindOptionsWhere<AlimtalkTemplate> = {
      code,
      isRemoved: false,
    };
    if (ctx.userId) where.createdByUserId = ctx.userId;

    const template = await this.templateRepo.findOne({
      where,
      relations: ['channel'],
    });
    if (!template) throw new NotFoundException('템플릿을 찾을 수 없어요.');

    const before = { ...template };

    await this.aligo.updateTemplate({
      senderKey: template.channel.senderKey,
      code,
      name: dto.name ?? template.name,
      content: dto.content ?? template.content,
      title: dto.title ?? template.title ?? undefined,
      subtitle: dto.subtitle ?? template.subtitle ?? undefined,
      buttons: dto.buttons ?? template.buttons ?? undefined,
    });

    Object.assign(template, dto);
    await this.templateRepo.save(template);
    await this.auditService.log({
      ...ctx,
      action: AuditAction.UPDATE,
      resource: AuditResource.TEMPLATE,
      resourceId: template.id,
      before,
      after: template,
    });
    return template;
  }

  async deleteTemplate(code: string, type: 'db' | 'kakao', ctx: AuditContext) {
    const where: FindOptionsWhere<AlimtalkTemplate> = {
      code,
      isRemoved: false,
    };
    if (ctx.userId) where.createdByUserId = ctx.userId;

    const template = await this.templateRepo.findOne({
      where,
      relations: ['channel'],
    });
    if (!template) throw new NotFoundException('템플릿을 찾을 수 없어요.');

    if (type === 'kakao') {
      await this.aligo.deleteTemplate(code, template.channel.senderKey);
    }

    const before = { isRemoved: false };
    template.isRemoved = true;
    await this.templateRepo.save(template);
    await this.auditService.log({
      ...ctx,
      action: AuditAction.DELETE,
      resource: AuditResource.TEMPLATE,
      resourceId: template.id,
      before,
      after: { isRemoved: true },
    });
  }

  async requestInspection(code: string, ctx: AuditContext) {
    const where: FindOptionsWhere<AlimtalkTemplate> = {
      code,
      isRemoved: false,
    };
    if (ctx.userId) where.createdByUserId = ctx.userId;

    const template = await this.templateRepo.findOne({
      where,
      relations: ['channel'],
    });
    if (!template) throw new NotFoundException('템플릿을 찾을 수 없어요.');

    await this.aligo.requestTemplateInspection(
      code,
      template.channel.senderKey,
    );

    template.inspStatus = 'REQ';
    await this.templateRepo.save(template);
    await this.auditService.log({
      ...ctx,
      action: AuditAction.UPDATE,
      resource: AuditResource.TEMPLATE,
      resourceId: template.id,
      after: { inspStatus: 'REQ' },
    });
    return { message: '검수 요청이 완료됐어요.' };
  }

  // ── 발송 ──────────────────────────────────────────────────────────────────

  private replaceVars(text: string, vars: Record<string, string>): string {
    return text.replace(/#\{([^}]+)\}/g, (_, key) => vars[key] ?? '');
  }

  async send(
    dto: AlimtalkSendDto,
    ctx: AuditContext,
  ): Promise<GeneralResponseDto<SendResultDataDto>> {
    const tid = generateTid('PAT');
    const channelWhere: FindOptionsWhere<AlimtalkChannel> = {
      id: dto.channelId,
      isActive: true,
    };
    if (ctx.userId) channelWhere.createdByUserId = ctx.userId;
    const channel = await this.channelRepo.findOneBy(channelWhere);
    if (!channel) throw new NotFoundException('채널을 찾을 수 없어요.');

    const templateWhere: FindOptionsWhere<AlimtalkTemplate> = {
      code: dto.templateCode,
      isRemoved: false,
    };
    if (ctx.userId) templateWhere.createdByUserId = ctx.userId;
    const template = await this.templateRepo.findOneBy(templateWhere);
    if (!template) throw new NotFoundException('템플릿을 찾을 수 없어요.');

    const vars = dto.variables ?? {};
    const content = this.replaceVars(template.content, vars);
    const title = template.title
      ? this.replaceVars(template.title, vars)
      : undefined;
    const subtitle = template.subtitle
      ? this.replaceVars(template.subtitle, vars)
      : undefined;
    const buttons = template.buttons?.map((btn) => {
      const linkMo = btn.linkMo || btn.linkM || btn.link_mobile;
      const linkPc = btn.linkPc || btn.linkP || btn.link_pc;
      const subbedMo = linkMo ? this.replaceVars(linkMo, vars) : linkMo;
      const subbedPc = linkPc ? this.replaceVars(linkPc, vars) : linkPc;
      
      return {
        ...btn,
        name: btn.name ? this.replaceVars(btn.name, vars) : btn.name,
        // 모든 변형 필드에 치환된 값을 선언하여 AligoProvider가 항상 새 값을 보게 함
        linkMo: subbedMo,
        linkM: subbedMo,
        linkPc: subbedPc,
        linkP: subbedPc,
      };
    });

    // 과거 시각이면 즉시 발송으로 처리
    const scheduledDate = dto.scheduledAt
      ? new Date(dto.scheduledAt)
      : undefined;
    const isScheduled = scheduledDate && scheduledDate > new Date();

    let aligoResult: any;
    try {
      aligoResult = await this.aligo.send({
        senderKey: channel.senderKey,
        templateCode: dto.templateCode,
        receiverPhone: dto.receiverPhone,
        content,
        title,
        subtitle,
        buttons,
        scheduledAt: isScheduled ? scheduledDate : undefined,
      });

      const msgEntity = this.messageRepo.create({
        transactionId: tid,
        providerMessageId: aligoResult.info?.mid ?? null,
        channelId: dto.channelId,
        templateCode: dto.templateCode,
        receiverPhone: dto.receiverPhone.replace(/-/g, ''),
        content,
        title: title ?? null,
        subtitle: template.subtitle ?? null,
        buttons: buttons ?? null,
        type: isScheduled ? MessageType.SCHEDULED : MessageType.IMMEDIATE,
        scheduledAt: isScheduled ? scheduledDate : null,
        sentAt: isScheduled ? null : new Date(),
        apiResponse: aligoResult.message ?? null,
        resultCode: null,
        resultMessage: null,
        isCompleted: false,
        sentByUserId: ctx.userId ?? null,
      });
      const message = await this.messageRepo.save(msgEntity);

      await this.auditService.log({
        ...ctx,
        action: AuditAction.SEND,
        resource: AuditResource.MESSAGE,
        resourceId: message.id,
        after: message,
      });

      return {
        tid,
        status: 'success',
        message: isScheduled
          ? '예약 발송이 등록되었습니다.'
          : '알림톡 발송 요청이 완료되었습니다.',
        data: {
          messageId: message.id,
          receiverPhone: message.receiverPhone,
          content: message.content,
          type: message.type,
          scheduledAt: message.scheduledAt,
          sentAt: message.sentAt,
        },
      };
    } catch (error) {
      // 발송 요청 실패 시 DB에 실패 기록 시도
      const msgEntity = this.messageRepo.create({
        transactionId: tid,
        channelId: dto.channelId,
        templateCode: dto.templateCode,
        receiverPhone: dto.receiverPhone.replace(/-/g, ''),
        content,
        title: title ?? null,
        subtitle: template.subtitle ?? null,
        buttons: buttons ?? null,
        type: isScheduled ? MessageType.SCHEDULED : MessageType.IMMEDIATE,
        scheduledAt:
          scheduledDate instanceof Date && !isNaN(scheduledDate.getTime())
            ? scheduledDate
            : null,
        sentAt: null,
        apiResponse: error.message ?? null,
        resultCode: 'FAILURE',
        resultMessage: error.message ?? 'Unknown error',
        isCompleted: true,
        sentByUserId: ctx.userId ?? null,
      });
      await this.messageRepo.save(msgEntity);
      throw error;
    }
  }

  async cancel(id: string, ctx: AuditContext) {
    const where: FindOptionsWhere<AlimtalkMessage> = { id };
    if (ctx.userId) where.sentByUserId = ctx.userId;

    const message = await this.messageRepo.findOneBy(where);
    if (!message) throw new NotFoundException('메시지를 찾을 수 없어요.');
    if (message.isRemoved)
      throw new BadRequestException('이미 취소된 메시지예요.');

    if (message.providerMessageId) {
      await this.aligo.cancel(message.providerMessageId);
    }

    const before = { type: message.type, isRemoved: message.isRemoved };
    message.type = MessageType.CANCELLED;
    message.isRemoved = true;
    await this.messageRepo.save(message);
    await this.auditService.log({
      ...ctx,
      action: AuditAction.CANCEL,
      resource: AuditResource.MESSAGE,
      resourceId: message.id,
      before,
      after: { type: MessageType.CANCELLED, isRemoved: true },
    });
    return { message: '취소됐어요.' };
  }

  async getHistory(filters: {
    channelId?: string;
    templateCode?: string;
    receiverPhone?: string;
    from?: Date;
    to?: Date;
    page?: number;
    limit?: number;
    userId?: string;
  }) {
    const qb = this.messageRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.channel', 'channel')
      .leftJoinAndSelect('m.sentByUser', 'user')
      .orderBy('m.createdAt', 'DESC');

    if (filters.userId)
      qb.andWhere('m.sentByUserId = :userId', { userId: filters.userId });
    if (filters.channelId)
      qb.andWhere('m.channelId = :channelId', { channelId: filters.channelId });
    if (filters.templateCode)
      qb.andWhere('m.templateCode = :templateCode', {
        templateCode: filters.templateCode,
      });
    if (filters.receiverPhone)
      qb.andWhere('m.receiverPhone = :phone', {
        phone: filters.receiverPhone.replace(/-/g, ''),
      });
    if (filters.from)
      qb.andWhere('m.createdAt >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('m.createdAt <= :to', { to: filters.to });

    const page = Number(filters.page ?? 1);
    const limit = Math.min(Number(filters.limit ?? 20), 100);
    const [items, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    // 미완료된 메시지 중 최근 3일 내 발송된 항목들에 대해 실시간 상태 동기화 시도
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const pendingItems = items.filter(
      (item) =>
        // !item.isCompleted && // 임시로 이미 완료된 항목도 매번 확인하도록 제거
        item.providerMessageId &&
        item.createdAt >= threeDaysAgo,
    );

    if (pendingItems.length > 0) {
      // API 과부하 방지를 위해 최대 20개까지만 동기화 (한 페이지 분량)
      const syncTargets = pendingItems.slice(0, 20);
      await Promise.all(syncTargets.map((item) => this.syncMessageResult(item)));
    }

    return { items, total, page, limit };
  }

  /**
   * 알리고 결과 API를 호출하여 메시지 상태를 동기화하고 DB에 저장합니다.
   */
  private async syncMessageResult(message: AlimtalkMessage): Promise<void> {
    if (!message.providerMessageId) return;

    try {
      const result = await this.aligo.getHistoryDetail(
        message.providerMessageId,
      );

      if (result) {
        message.resultCode = result.resultCode;
        message.resultMessage = result.resultMessage;
        message.resultCheckedAt = new Date();
        message.isCompleted = result.isCompleted;

        // 실제 발송된 시간이 있다면 업데이트
        if (result.sentAt) {
          message.sentAt = result.sentAt;
        }

        await this.messageRepo.save(message);
      }
    } catch (error) {
      this.logger.error(
        `Failed to sync alimtalk message [${message.id}]: ${error.message}`,
      );
    }
  }

  async getResult(
    tid: string,
    userId?: string,
  ): Promise<GeneralResponseDto<ResultCheckDataDto>> {
    const where: FindOptionsWhere<AlimtalkMessage> = { transactionId: tid };
    if (userId) where.sentByUserId = userId;

    const message = await this.messageRepo.findOneBy(where);
    if (!message) throw new NotFoundException('메시지를 찾을 수 없어요.');
    if (!message.providerMessageId) {
      return {
        tid,
        status: 'success',
        data: {
          resultCode: message.resultCode,
          resultMessage: message.resultMessage,
          checkedAt: message.resultCheckedAt,
          receiverPhone: message.receiverPhone,
          sentAt: message.sentAt,
          scheduledAt:
            message.scheduledAt instanceof Date &&
            !isNaN(message.scheduledAt.getTime())
              ? message.scheduledAt
              : null,
        },
      };
    }

    await this.syncMessageResult(message);

    return {
      tid,
      status: 'success',
      data: {
        resultCode: message.resultCode,
        resultMessage: message.resultMessage,
        checkedAt: message.resultCheckedAt,
        receiverPhone: message.receiverPhone,
        sentAt: message.sentAt,
        scheduledAt:
          message.scheduledAt instanceof Date &&
          !isNaN(message.scheduledAt.getTime())
            ? message.scheduledAt
            : null,
      },
    };
  }
}
