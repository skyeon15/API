import { Injectable, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentMethod } from './entities/payment-method.entity.js';
import { PayappSeller } from './entities/payapp-seller.entity.js';
import { User } from './entities/user.entity.js';
import { firstValueFrom } from 'rxjs';
import * as qs from 'querystring';

@Injectable()
export class PaymentService {
  private readonly PAYAPP_API_URL = 'https://api.payapp.kr/oapi/apiLoad.html';

  constructor(
    private readonly httpService: HttpService,
    @InjectRepository(PaymentMethod)
    private readonly paymentRepo: Repository<PaymentMethod>,
    @InjectRepository(PayappSeller)
    private readonly sellerRepo: Repository<PayappSeller>,
  ) {}

  async registerSeller(
    user: User,
    data: {
      sellerId: string;
      sellerPwd: string;
      sellerName: string;
      email: string;
      phone: string;
      usertype: '1' | '2'; // 1: 개인, 2: 사업자
      bizkind: string;
      memo?: string;
      // 사업자일 경우 필수
      compregno?: string;
      compname?: string;
      biztype1?: string;
      biztype2?: string;
      ceo_nm?: string;
    },
  ) {
    const resellerid =
      process.env.API_PAYAPP_RESELLERID || process.env.API_PAYAPP_USERID;

    if (!resellerid) {
      throw new BadRequestException(
        '리셀러 아이디 설정이 완료되지 않았습니다.',
      );
    }

    const postData: any = {
      cmd: 'sellerRegist',
      userid: data.sellerId,
      userpwd: data.sellerPwd,
      sellername: data.sellerName,
      phone: data.phone.replace(/\D/g, ''),
      email: data.email,
      usertype: data.usertype,
      bizkind: data.bizkind,
      resellerid: resellerid,
      join_type: '4', // 할인 가입
      seller_type: 'seller',
    };

    if (data.usertype === '2') {
      postData.compregno = data.compregno?.replace(/\D/g, '');
      postData.compname = data.compname;
      postData.biztype1 = data.biztype1;
      postData.biztype2 = data.biztype2;
      postData.ceo_nm = data.ceo_nm;
    } else {
      postData.username = data.sellerName;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(this.PAYAPP_API_URL, qs.stringify(postData), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }),
      );

      console.log(
        `[payapp API Response] cmd: ${postData.cmd}, data:`,
        response.data,
      );

      const result = qs.parse(response.data) as any;

      if (result.state !== '1') {
        throw new BadRequestException(
          result.errorMessage || '판매자 가입에 실패했습니다.',
        );
      }

      const seller = this.sellerRepo.create({
        userId: user.id,
        sellerId: result.userid,
        linkKey: result.linkkey,
        linkVal: result.linkval,
        memo: data.memo,
        isActive: true,
      });

      return await this.sellerRepo.save(seller);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        'payapp 통신 중 오류가 발생했습니다: ' + error.message,
      );
    }
  }

  async checkSellerId(sellerId: string) {
    const resellerid =
      process.env.API_PAYAPP_RESELLERID || process.env.API_PAYAPP_USERID;

    if (!resellerid) {
      throw new BadRequestException(
        '리셀러 아이디 설정이 완료되지 않았습니다.',
      );
    }

    const postData = {
      cmd: 'useridCheck',
      userid: sellerId,
      resellerid: resellerid,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(this.PAYAPP_API_URL, qs.stringify(postData), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }),
      );

      console.log(
        `[payapp API Response] cmd: ${postData.cmd}, data:`,
        response.data,
      );

      const result = qs.parse(response.data) as any;

      if (result.state !== '1') {
        throw new BadRequestException(
          result.errorMessage ||
            '이미 사용 중이거나 사용할 수 없는 아이디입니다.',
        );
      }

      return { success: true, message: '사용 가능한 아이디입니다.' };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        'payapp 통신 중 오류가 발생했습니다: ' + error.message,
      );
    }
  }

  async registerCard(
    user: User,
    cardInfo: {
      cardNo: string;
      expMonth: string;
      expYear: string;
      cardPw: string;
      buyerAuthNo: string;
    },
  ) {
    const userid = process.env.API_PAYAPP_USERID;
    const linkkey = process.env.API_PAYAPP_LINKKEY;

    if (!userid || !linkkey) {
      throw new BadRequestException('결제 시스템 설정이 완료되지 않았습니다.');
    }

    const postData = {
      cmd: 'billRegist',
      userid,
      linkkey,
      cardNo: cardInfo.cardNo.replace(/\D/g, ''),
      expMonth: cardInfo.expMonth,
      expYear: cardInfo.expYear,
      cardPw: cardInfo.cardPw,
      buyerAuthNo: cardInfo.buyerAuthNo,
      buyerPhone: user.phone,
      buyerName: user.name,
      buyerId: `api.${user.id}`,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(this.PAYAPP_API_URL, qs.stringify(postData), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }),
      );

      console.log(
        `[payapp API Response] cmd: ${postData.cmd}, data:`,
        response.data,
      );

      // payapp returns data in querystring format as a string
      const result = qs.parse(response.data) as any;

      if (result.state !== '1') {
        throw new BadRequestException(
          result.errorMessage || '카드 등록에 실패했습니다.',
        );
      }

      // 실제 응답 필드명(소문자)을 우선 사용하고, 대괄호[] 제거
      const rawCardName = result.cardname || result.cardName || '카드';
      const cleanCardName = rawCardName.replace(/[\[\]]/g, '');

      const payment = this.paymentRepo.create({
        userId: user.id,
        cardNo:
          result.cardno ||
          result.cardNum ||
          cardInfo.cardNo.slice(0, 4) + '********' + cardInfo.cardNo.slice(-4),
        cardName: cleanCardName,
        merchantId: userid,
        billingKey: result.encBill,
        isActive: true,
      });

      return await this.paymentRepo.save(payment);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        'payapp 통신 중 오류가 발생했습니다: ' + error.message,
      );
    }
  }

  async deleteCard(payment: PaymentMethod) {
    const userid = process.env.API_PAYAPP_USERID;
    const linkkey = process.env.API_PAYAPP_LINKKEY;

    if (!userid || !linkkey) {
      throw new BadRequestException('결제 시스템 설정이 완료되지 않았습니다.');
    }

    const postData = {
      cmd: 'billDelete',
      userid,
      linkkey,
      encBill: payment.billingKey,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(this.PAYAPP_API_URL, qs.stringify(postData), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }),
      );

      console.log(
        `[payapp API Response] cmd: ${postData.cmd}, data:`,
        response.data,
      );

      const result = qs.parse(response.data) as any;

      if (result.state !== '1') {
        throw new BadRequestException(
          result.errorMessage || 'payapp에서 카드 삭제에 실패했습니다.',
        );
      }

      return true;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        'payapp 통신 중 오류가 발생했습니다: ' + error.message,
      );
    }
  }
}
