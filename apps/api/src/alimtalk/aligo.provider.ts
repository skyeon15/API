import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import axios from 'axios';

const BASE_URL = 'https://kakaoapi.aligo.in/akv10';

@Injectable()
export class AligoProvider {
  private readonly logger = new Logger(AligoProvider.name);

  private get credentials() {
    return {
      apikey: process.env.API_ALIGO_API_KEY,
      userid: process.env.API_ALIGO_USER_ID,
    };
  }

  private async post<T = any>(
    path: string,
    params: Record<string, any> = {},
  ): Promise<T> {
    const combinedParams = {
      ...this.credentials,
      ...params,
    };

    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(combinedParams)) {
      if (value !== undefined && value !== null)
        form.append(key, String(value));
    }

    try {
      const { data } = await axios.post<T>(`${BASE_URL}${path}`, form, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      // 알리고 API 내의 응답 코드 검증 (0이 성공)
      if (
        data &&
        (data as any).code !== undefined &&
        (data as any).code !== 0
      ) {
        throw new BadRequestException(
          (data as any).message || '요청 처리 중 오류가 발생했습니다.',
        );
      }

      return data;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Aligo API 통신 오류 [${path}]: ${error.message}`);
      throw new InternalServerErrorException(
        '외부 서비스와의 통신 중 오류가 발생했습니다.',
      );
    }
  }

  async send(params: {
    senderKey: string;
    templateCode: string;
    receiverPhone: string;
    content: string;
    title?: string;
    subtitle?: string;
    buttons?: Record<string, any>[];
    scheduledAt?: string; // YYYYMMDDHHMMSS
  }) {
    const payload: Record<string, any> = {
      sender: process.env.API_ALIGO_SENDER || '07041383114',
      senderkey: params.senderKey,
      tpl_code: params.templateCode,
      receiver_1: params.receiverPhone.replace(/-/g, ''),
      message_1: params.content,
      failover: process.env.API_ALIGO_FAILOVER === 'N' ? 'N' : 'Y',
    };

    // 템플릿 정보 매핑 (상단 헤더: subject_1, 강조 제목: emtitle_1)
    // 현재 DB의 title이 강조 제목(tpl_title), subtitle이 헤더(tpl_subtitle)로 동기화되어 있음
    if (params.subtitle) {
      payload.subject_1 = params.subtitle;
    }
    
    if (params.title) {
      payload.emtitle_1 = params.title;
      // 대체발송(LMS) 제목은 강조제목이 있다면 이를 우선 사용
      payload.fsubject_1 = params.title;
    } else if (!payload.fsubject_1) {
      payload.fsubject_1 = '[알림톡]';
    }

    // 대체발송 본문 구성 (버튼 URL 포함)
    let fmessage = params.content;

    // 제목/부제목이 있다면 대체발송 본문 상단에 추가 (시각적 일관성)
    if (params.title || params.subtitle) {
      const header = [params.title, params.subtitle].filter(Boolean).join('\n');
      fmessage = `${header}\n\n${fmessage}`;
    }

    if (params.buttons && params.buttons.length > 0) {
      const buttonLinks = params.buttons
        .filter((btn) => btn.linkMo || btn.linkPc || btn.linkM || btn.linkP)
        .map((btn) => `- ${btn.name}: ${btn.linkMo || btn.linkPc || btn.linkM || btn.linkP}`)
        .join('\n');
      if (buttonLinks) {
        fmessage += `\n\n${buttonLinks}`;
      }
      
      // 알림톡 버튼 JSON 구성 (linkMo, linkPc 필드 규격 준수)
      payload.button_1 = JSON.stringify({
        button: params.buttons.map((btn) => {
          const { linkM, linkP, link_mobile, link_pc, ...rest } = btn;
          return {
            ...rest,
            linkMo: btn.linkMo || linkM || link_mobile,
            linkPc: btn.linkPc || linkP || link_pc,
          };
        }),
      });
    }

    payload.fmessage_1 = fmessage;
    if (params.scheduledAt) payload.sendtime = params.scheduledAt;

    return this.post('/alimtalk/send/', payload);
  }

  async cancel(mid: string) {
    return this.post('/cancel/', { mid });
  }

  async getTemplates(senderKey?: string) {
    const res = await this.post<any>(
      '/template/list/',
      senderKey ? { senderkey: senderKey } : {},
    );
    const raw: any[] = res.list ?? res.data ?? [];
    return {
      ...res,
      list: raw.map((t) => {
        const title = t.templtTitle ?? t.tpl_title ?? null;
        const imageUrl = t.templtImageUrl ?? t.templtImageName ?? null;
        const type = imageUrl ? 'IM' : title ? 'EX' : 'BA';
        return {
          code: t.templtCode ?? t.tpl_code,
          name: t.templtName ?? t.tpl_name,
          content: t.templtContent ?? t.tpl_content,
          title,
          subtitle: t.templtSubtitle ?? t.tpl_subtitle ?? null,
          type,
          inspStatus: t.inspStatus ?? t.tpl_status ?? null,
          buttons: t.buttons ?? null,
          createdAt: t.cdate ?? null,
        };
      }),
    };
  }

  async getHistoryDetail(mid: string) {
    return this.post('/history/detail/', { mid });
  }

  async getCategories() {
    return this.post('/category/');
  }

  async listChannels() {
    const res = await this.post<any>('/profile/list/');
    const raw: any[] = res.list ?? res.data ?? [];
    return {
      ...res,
      list: raw.map((c) => ({
        senderKey: c.senderKey ?? c.senderkey,
        plusId: c.uuid ?? c.plusid ?? c.plus_id,
        name: c.name,
        categoryCode: c.catCode ?? c.categorycode ?? c.category_code,
        status: c.status,
      })),
    };
  }

  async requestChannelAuth(plusId: string, phone: string) {
    return this.post('/profile/auth/', {
      plusid: plusId,
      phonenumber: phone.replace(/-/g, ''),
    });
  }

  async addChannel(params: {
    plusId: string;
    authNum: string;
    phone: string;
    categoryCode: string;
  }) {
    return this.post('/profile/add/', {
      plusid: params.plusId,
      authnum: params.authNum,
      phonenumber: params.phone.replace(/-/g, ''),
      categorycode: params.categoryCode,
    });
  }

  async addTemplate(params: {
    senderKey: string;
    name: string;
    content: string;
    type: string;
    title?: string;
    subtitle?: string;
    buttons?: Record<string, any>[];
  }) {
    const typeMap: Record<string, string> = {
      기본형: 'BA',
      강조표기형: 'EX',
      이미지형: 'IM',
    };
    const payload: Record<string, any> = {
      senderkey: params.senderKey,
      tpl_name: params.name,
      tpl_content: params.content,
      tpl_type: typeMap[params.type] ?? 'BA',
    };
    if (params.title) payload.tpl_title = params.title;
    if (params.subtitle) payload.tpl_subtitle = params.subtitle;
    if (params.buttons?.length)
      payload.buttons = JSON.stringify(params.buttons);
    return this.post('/template/add/', payload);
  }

  async updateTemplate(params: {
    senderKey: string;
    code: string;
    name: string;
    content: string;
    title?: string;
    subtitle?: string;
    buttons?: Record<string, any>[];
  }) {
    const payload: Record<string, any> = {
      senderkey: params.senderKey,
      tpl_code: params.code,
      tpl_name: params.name,
      tpl_content: params.content,
    };
    if (params.title) payload.tpl_title = params.title;
    if (params.subtitle) payload.tpl_subtitle = params.subtitle;
    if (params.buttons?.length)
      payload.buttons = JSON.stringify(params.buttons);
    return this.post('/template/modify/', payload);
  }

  async deleteTemplate(code: string, senderKey: string) {
    return this.post('/template/del/', {
      tpl_code: code,
      senderkey: senderKey,
    });
  }

  async requestTemplateInspection(code: string, senderKey: string) {
    return this.post('/template/request/', {
      tpl_code: code,
      senderkey: senderKey,
    });
  }
}
