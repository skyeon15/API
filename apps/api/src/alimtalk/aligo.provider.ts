import {
  Injectable,
  Logger,
  InternalServerErrorException,
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

    // 보안을 위해 API 키와 사용자 ID는 마스킹 처리하여 로그 기록
    const maskedParams = {
      ...combinedParams,
      apikey: '********',
      userid: combinedParams.userid ? '********' : undefined,
    };

    try {
      const { data } = await axios.post<T>(`${BASE_URL}${path}`, form, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      return data;
    } catch (error) {
      this.logger.error(`Aligo API 오류 [${path}]: ${error.message}`);
      throw new InternalServerErrorException(`알리고 API 호출 실패: ${path}`);
    }
  }

  async send(params: {
    senderKey: string;
    templateCode: string;
    receiverPhone: string;
    content: string;
    title?: string;
    buttons?: Record<string, any>[];
    scheduledAt?: string; // YYYYMMDDHHMMSS
  }) {
    const payload: Record<string, any> = {
      senderkey: params.senderKey,
      tpl_code: params.templateCode,
      receiver_1: params.receiverPhone.replace(/-/g, ''),
      message_1: params.content,
      failover: process.env.API_ALIGO_FAILOVER === 'N' ? 'N' : 'Y',
    };
    if (params.title) payload.subject_1 = params.title;
    if (params.scheduledAt) payload.sendtime = params.scheduledAt;
    if (params.buttons?.length) {
      payload.button_1 = JSON.stringify({
        button: params.buttons.map((btn) => ({
          name: btn.name,
          linkType: btn.linkType,
          linkM: btn.linkMo,
          linkP: btn.linkPc,
        })),
      });
    }
    return this.post('/alimtalk/send/', payload);
  }

  async cancel(mid: string) {
    return this.post('/cancel/', { mid });
  }

  async getTemplates(senderKey?: string) {
    return this.post(
      '/template/list/',
      senderKey ? { senderkey: senderKey } : {},
    );
  }

  async getHistoryDetail(mid: string) {
    return this.post('/history/detail/', { mid });
  }

  async getCategories() {
    return this.post('/category/');
  }

  async listChannels() {
    return this.post('/profile/list/');
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
