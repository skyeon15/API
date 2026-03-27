import { Injectable, Logger, InternalServerErrorException, NotFoundException, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { TimeService } from '../common/time.service.js';
import * as cheerio from 'cheerio';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';

const LostarkProfileSchema = z.object({
  name: z.string(),
  server: z.string(),
  level: z.string(),
  lever_expedition: z.string(),
  level_fight: z.string(),
  level_item: z.string(),
  level_item2: z.string(),
  title: z.string(),
  guild: z.string(),
  pvp: z.string(),
  wisdom: z.string(),
  wisdom_level: z.string(),
});

type LostarkProfile = z.infer<typeof LostarkProfileSchema>;

@Injectable()
export class LostarkService {
  private readonly logger = new Logger(LostarkService.name);
  private readonly USER_AGENT = 'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.3; WOW64; Trident/7.0)';

  constructor(
    private readonly httpService: HttpService,
    private readonly timeService: TimeService
  ) {}

  async getProfile(nickname: string): Promise<LostarkProfile> {
    if (!nickname) {
      throw new BadRequestException('닉네임을 입력해주세요.');
    }

    const url = `https://lostark.game.onstove.com/Profile/Character/${encodeURIComponent(nickname)}`;
    
    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: { 'User-Agent': this.USER_AGENT },
        })
      );
      
      const $ = cheerio.load(response.data);
      
      // 닉네임 요소를 찾아 존재 여부 확인
      const name = $('.profile-character-info__name').text().trim();
      if (!name) {
        throw new NotFoundException('캐릭터 정보를 찾을 수 없어요.');
      }

      const profileData = {
        name,
        server: $('.profile-character-info__server').text().replace('@', '').trim(),
        level: $('.profile-character-info__lv').text().replace('Lv.', '').trim(),
        lever_expedition: $('.level-info__expedition > span').text().replace('원정대 레벨Lv.', '').trim(),
        level_fight: $('.level-info__item > span:nth-child(2)').text().replace('Lv.', '').trim(),
        level_item: $('.level-info2__expedition > span:nth-child(2)').text().replace('Lv.', '').trim(),
        level_item2: $('.level-info2__item > span:nth-child(2)').text().replace('Lv.', '').trim(),
        title: $('.game-info__title > span:nth-child(2)').text().trim(),
        guild: $('.game-info__guild > span:nth-child(2)').text().trim(),
        pvp: $('.level-info__pvp > span:nth-child(2)').text().trim(),
        wisdom: $('.game-info__wisdom > span:nth-child(3)').text().trim(),
        wisdom_level: $('.game-info__wisdom > span:nth-child(2)').text().replace('Lv.', '').trim(),
      };

      // Zod validation (axios-zod pattern)
      return LostarkProfileSchema.parse(profileData);

    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      this.logger.error(`Error fetching Lost Ark profile for ${nickname}:`, error);
      throw new InternalServerErrorException('로스트아크 정보를 가져오는 중 오류가 발생했습니다.');
    }
  }

  formatAsText(profile: LostarkProfile): string {
    const text = `[ ${profile.name}의 로스트아크 ][br]
조회시각 : ${this.timeService.format('YYYY-MM-DD hh:mm:ss')}[br]
Lv.${profile.level}[br]
서버 : ${profile.server}[br]
PVP : ${profile.pvp}[br]
칭호 : ${profile.title}[br]
길드 : ${profile.guild}[br]
영지 : ${profile.wisdom} (Lv.${profile.wisdom_level})[br]
[br]
레벨 정보[br]
원정대 : ${profile.lever_expedition}[br]
전투 : ${profile.level_fight}[br]
장착 아이템 : ${profile.level_item}[br]
달성 아이템 : ${profile.level_item2}`;
    
    return text.replace(/  +/g, "");
  }
}
