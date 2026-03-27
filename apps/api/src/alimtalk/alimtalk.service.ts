import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlimtalkChannel } from './entities/channel.entity.js';
import { AlimtalkTemplate, TemplateType } from './entities/template.entity.js';
import { AlimtalkMessage, MessageType } from './entities/message.entity.js';
import { AuditService, AuditContext } from '../audit/audit.service.js';
import { AuditAction, AuditResource } from '../audit/entities/audit-log.entity.js';
import { AligoProvider } from './aligo.provider.js';

@Injectable()
export class AlimtalkService {
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

  getChannels() {
    return this.channelRepo.find({ order: { createdAt: 'DESC' } });
  }

  getCategories() {
    return this.aligo.getCategories();
  }

  requestChannelAuth(plusId: string, phone: string) {
    return this.aligo.requestChannelAuth(plusId, phone);
  }

  async addChannel(
    params: { plusId: string; authNum: string; phone: string; categoryCode: string; name: string },
    ctx: AuditContext,
  ) {
    const aligoResult = await this.aligo.addChannel(params);
    if (aligoResult.code !== 0) throw new BadRequestException(aligoResult.message);

    const senderKey = aligoResult.info?.senderkey ?? aligoResult.senderkey;
    const channel = await this.channelRepo.save(this.channelRepo.create({
      senderKey,
      plusId: params.plusId,
      name: params.name,
      categoryCode: params.categoryCode,
      createdByUserId: ctx.userId,
    }));

    await this.auditService.log({ ...ctx, action: AuditAction.CREATE, resource: AuditResource.CHANNEL, resourceId: channel.id, after: channel });
    return channel;
  }

  async updateChannel(id: number, dto: Partial<Pick<AlimtalkChannel, 'name' | 'isActive'>>, ctx: AuditContext) {
    const channel = await this.channelRepo.findOneBy({ id });
    if (!channel) throw new NotFoundException('채널을 찾을 수 없어요.');
    const before = { ...channel };
    Object.assign(channel, dto);
    await this.channelRepo.save(channel);
    await this.auditService.log({ ...ctx, action: AuditAction.UPDATE, resource: AuditResource.CHANNEL, resourceId: channel.id, before, after: channel });
    return channel;
  }

  // ── 템플릿 ────────────────────────────────────────────────────────────────

  getTemplates(channelId?: number) {
    return this.templateRepo.find({
      where: { isRemoved: false, ...(channelId ? { channelId } : {}) },
      relations: ['channel'],
      order: { createdAt: 'DESC' },
    });
  }

  getLiveTemplates(senderKey?: string) {
    return this.aligo.getTemplates(senderKey);
  }

  async syncTemplates(channelId: number, ctx: AuditContext) {
    const channel = await this.channelRepo.findOneBy({ id: channelId });
    if (!channel) throw new NotFoundException('채널을 찾을 수 없어요.');

    const result = await this.aligo.getTemplates(channel.senderKey);
    const templates: any[] = result.data ?? [];
    const typeMap: Record<string, TemplateType> = { BA: TemplateType.BASIC, EX: TemplateType.EMPHASIS, IM: TemplateType.IMAGE };

    for (const tpl of templates) {
      const existing = await this.templateRepo.findOneBy({ code: tpl.tpl_code });
      const data = {
        name: tpl.tpl_name,
        content: tpl.tpl_content,
        title: tpl.tpl_title ?? null,
        subtitle: tpl.tpl_subtitle ?? null,
        inspStatus: tpl.tpl_status,
        type: typeMap[tpl.tpl_type] ?? TemplateType.BASIC,
      };
      if (existing) {
        await this.templateRepo.save(Object.assign(existing, data));
      } else {
        await this.templateRepo.save(this.templateRepo.create({ ...data, code: tpl.tpl_code, channelId, createdByUserId: ctx.userId }));
      }
    }
    return { synced: templates.length };
  }

  async createTemplate(
    dto: { channelId: number; name: string; type: TemplateType; content: string; title?: string; subtitle?: string; buttons?: Record<string, any>[] },
    ctx: AuditContext,
  ) {
    const channel = await this.channelRepo.findOneBy({ id: dto.channelId });
    if (!channel) throw new NotFoundException('채널을 찾을 수 없어요.');

    const aligoResult = await this.aligo.addTemplate({ senderKey: channel.senderKey, ...dto });
    if (aligoResult.code !== 0) throw new BadRequestException(aligoResult.message);

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

    await this.auditService.log({ ...ctx, action: AuditAction.CREATE, resource: AuditResource.TEMPLATE, resourceId: template.id, after: template });
    return template;
  }

  async updateTemplate(code: string, dto: Partial<{ name: string; content: string; title: string; subtitle: string; buttons: Record<string, any>[] }>, ctx: AuditContext) {
    const template = await this.templateRepo.findOne({ where: { code, isRemoved: false }, relations: ['channel'] });
    if (!template) throw new NotFoundException('템플릿을 찾을 수 없어요.');
    const before = { ...template };

    const aligoResult = await this.aligo.updateTemplate({
      senderKey: template.channel.senderKey,
      code,
      name: dto.name ?? template.name,
      content: dto.content ?? template.content,
      title: (dto.title ?? template.title) ?? undefined,
      subtitle: (dto.subtitle ?? template.subtitle) ?? undefined,
      buttons: (dto.buttons ?? template.buttons) ?? undefined,
    });
    if (aligoResult.code !== 0) throw new BadRequestException(aligoResult.message);

    Object.assign(template, dto);
    await this.templateRepo.save(template);
    await this.auditService.log({ ...ctx, action: AuditAction.UPDATE, resource: AuditResource.TEMPLATE, resourceId: template.id, before, after: template });
    return template;
  }

  async deleteTemplate(code: string, type: 'db' | 'kakao', ctx: AuditContext) {
    const template = await this.templateRepo.findOne({ where: { code, isRemoved: false }, relations: ['channel'] });
    if (!template) throw new NotFoundException('템플릿을 찾을 수 없어요.');

    if (type === 'kakao') {
      const aligoResult = await this.aligo.deleteTemplate(code, template.channel.senderKey);
      if (aligoResult.code !== 0) throw new BadRequestException(aligoResult.message);
    }

    const before = { isRemoved: false };
    template.isRemoved = true;
    await this.templateRepo.save(template);
    await this.auditService.log({ ...ctx, action: AuditAction.DELETE, resource: AuditResource.TEMPLATE, resourceId: template.id, before, after: { isRemoved: true } });
  }

  async requestInspection(code: string, ctx: AuditContext) {
    const template = await this.templateRepo.findOne({ where: { code, isRemoved: false }, relations: ['channel'] });
    if (!template) throw new NotFoundException('템플릿을 찾을 수 없어요.');

    const aligoResult = await this.aligo.requestTemplateInspection(code, template.channel.senderKey);
    if (aligoResult.code !== 0) throw new BadRequestException(aligoResult.message);

    template.inspStatus = 'REQ';
    await this.templateRepo.save(template);
    await this.auditService.log({ ...ctx, action: AuditAction.UPDATE, resource: AuditResource.TEMPLATE, resourceId: template.id, after: { inspStatus: 'REQ' } });
    return { message: '검수 요청이 완료됐어요.' };
  }

  // ── 발송 ──────────────────────────────────────────────────────────────────

  private replaceVars(text: string, vars: Record<string, string>): string {
    return text.replace(/#\{([^}]+)\}/g, (_, key) => vars[key] ?? `#{${key}}`);
  }

  async send(
    dto: { channelId: number; templateCode: string; receiverPhone: string; variables?: Record<string, string>; scheduledAt?: Date },
    ctx: AuditContext,
  ) {
    const channel = await this.channelRepo.findOneBy({ id: dto.channelId, isActive: true });
    if (!channel) throw new NotFoundException('채널을 찾을 수 없어요.');

    const template = await this.templateRepo.findOneBy({ code: dto.templateCode, isRemoved: false });
    if (!template) throw new NotFoundException('템플릿을 찾을 수 없어요.');

    const vars = dto.variables ?? {};
    const content = this.replaceVars(template.content, vars);
    const title = template.title ? this.replaceVars(template.title, vars) : undefined;
    const buttons = template.buttons?.map(btn => ({
      ...btn,
      linkMo: btn.linkMo ? this.replaceVars(btn.linkMo, vars) : btn.linkMo,
      linkPc: btn.linkPc ? this.replaceVars(btn.linkPc, vars) : btn.linkPc,
    }));

    const scheduledAt = dto.scheduledAt
      ? new Date(dto.scheduledAt).toISOString().replace(/[-:T]/g, '').slice(0, 14)
      : undefined;

    const aligoResult = await this.aligo.send({
      senderKey: channel.senderKey,
      templateCode: dto.templateCode,
      receiverPhone: dto.receiverPhone,
      content,
      title,
      buttons,
      scheduledAt,
    });

    const msgEntity = this.messageRepo.create({
      aligoMsgId: aligoResult.info?.mid ?? null,
      channelId: dto.channelId,
      templateCode: dto.templateCode,
      receiverPhone: dto.receiverPhone.replace(/-/g, ''),
      content,
      title: title ?? null,
      subtitle: template.subtitle ?? null,
      buttons: buttons ?? null,
      type: dto.scheduledAt ? MessageType.SCHEDULED : MessageType.IMMEDIATE,
      scheduledAt: dto.scheduledAt ?? null,
      sentAt: dto.scheduledAt ? null : new Date(),
      apiResponse: aligoResult.message ?? null,
      isCompleted: !dto.scheduledAt,
      sentByUserId: ctx.userId ?? null,
    });
    const message = await this.messageRepo.save(msgEntity);

    await this.auditService.log({ ...ctx, action: AuditAction.SEND, resource: AuditResource.MESSAGE, resourceId: message.id, after: message });
    return message;
  }

  async cancel(id: number, ctx: AuditContext) {
    const message = await this.messageRepo.findOneBy({ id });
    if (!message) throw new NotFoundException('메시지를 찾을 수 없어요.');
    if (message.isRemoved) throw new BadRequestException('이미 취소된 메시지예요.');

    if (message.aligoMsgId) {
      const aligoResult = await this.aligo.cancel(message.aligoMsgId);
      if (aligoResult.code !== 0) throw new BadRequestException(aligoResult.message);
    }

    const before = { type: message.type, isRemoved: message.isRemoved };
    message.type = MessageType.CANCELLED;
    message.isRemoved = true;
    await this.messageRepo.save(message);
    await this.auditService.log({ ...ctx, action: AuditAction.CANCEL, resource: AuditResource.MESSAGE, resourceId: message.id, before, after: { type: MessageType.CANCELLED, isRemoved: true } });
    return { message: '취소됐어요.' };
  }

  async getHistory(filters: { channelId?: number; templateCode?: string; receiverPhone?: string; from?: Date; to?: Date; page?: number; limit?: number }) {
    const qb = this.messageRepo.createQueryBuilder('m')
      .leftJoinAndSelect('m.channel', 'channel')
      .orderBy('m.createdAt', 'DESC');

    if (filters.channelId) qb.andWhere('m.channelId = :channelId', { channelId: filters.channelId });
    if (filters.templateCode) qb.andWhere('m.templateCode = :templateCode', { templateCode: filters.templateCode });
    if (filters.receiverPhone) qb.andWhere('m.receiverPhone = :phone', { phone: filters.receiverPhone.replace(/-/g, '') });
    if (filters.from) qb.andWhere('m.createdAt >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('m.createdAt <= :to', { to: filters.to });

    const page = Number(filters.page ?? 1);
    const limit = Math.min(Number(filters.limit ?? 20), 100);
    const [items, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    return { items, total, page, limit };
  }

  async getResult(id: number) {
    const message = await this.messageRepo.findOneBy({ id });
    if (!message) throw new NotFoundException('메시지를 찾을 수 없어요.');
    if (!message.aligoMsgId) return message;

    const aligoResult = await this.aligo.getHistoryDetail(message.aligoMsgId);
    const detail = aligoResult.data?.[0];
    if (detail) {
      message.resultCode = detail.rslt;
      message.resultMessage = detail.rslt_message;
      message.resultCheckedAt = new Date();
      await this.messageRepo.save(message);
    }
    return message;
  }
}
