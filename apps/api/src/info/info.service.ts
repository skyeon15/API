import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TimeService } from '../common/time.service.js';
import { RedisService } from '../common/redis/redis.service.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

@Injectable()
export class InfoService implements OnModuleInit {
  private readonly logger = new Logger(InfoService.name);
  private covidData: any = null;
  private readonly REDIS_KEY = 'info:covid_data';

  constructor(
    private readonly timeService: TimeService,
    private readonly redisService: RedisService,
  ) {}

  async onModuleInit() {
    await this.loadCovidData();
  }

  private async loadCovidData() {
    try {
      const cached = await this.redisService.get(this.REDIS_KEY);
      if (cached) {
        this.covidData = JSON.parse(cached);
      } else {
        this.covidData = {
          datetime: this.timeService.format('YYYY-MM-DD hh:mm:ss'),
          confirmed: [0, 0],
          critical: [0, 0],
          deceased: [0, 0],
          raw_time: 0,
        };
        await this.redisService.set(
          this.REDIS_KEY,
          JSON.stringify(this.covidData),
        );
      }
    } catch (error) {
      this.logger.error('코로나 데이터 로드 오류', error.message);
    }
  }

  async getCovidStats(type?: string) {
    const now = new Date().getTime();
    // 5분 캐시
    if ((this.covidData.raw_time || 0) + 60000 * 5 < now) {
      try {
        const response = await axios.get(
          'https://coronaboard.kr/generated/KR.json',
        );
        const data = response.data;
        const length = data.date.length - 1;

        let confirmedDiff = data.confirmed[length];
        let criticalDiff = data.critical[length];
        let deceasedDiff = data.death[length];

        // 12시 지나서 발표자료가 없으면 직전 자료로 대체 (레거시 로직)
        if (confirmedDiff === 0 && this.covidData) {
          confirmedDiff = this.covidData.confirmed[1];
          criticalDiff = this.covidData.critical[1];
          deceasedDiff = this.covidData.deceased[1];
        }

        const result = {
          datetime: this.timeService.format('YYYY-MM-DD hh:mm:ss', now),
          confirmed: [data.confirmed_acc[length], confirmedDiff],
          critical: [data.critical_acc[length], criticalDiff],
          deceased: [data.death_acc[length], deceasedDiff],
          raw_time: now,
        };

        this.covidData = result;
        await this.redisService.set(
          this.REDIS_KEY,
          JSON.stringify(this.covidData),
        );
      } catch (error) {
        this.logger.error('코로나 정보 갱신 오류', error.message);
      }
    }

    if (type === 'text' || type === 'txt') {
      const dot = (num: number, compare = false) => {
        const sign = Math.sign(num);
        const formatted = num
          .toString()
          .replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ',');
        if (sign !== -1 && compare) return `+${formatted}`;
        return formatted;
      };

      const result = `[ 국내 코로나 현황 ][br]
      조회시각 : ${this.covidData.datetime}[br]
      직전 발표자료[br]
      누적 확진자 : ${dot(this.covidData.confirmed[0])}(${dot(this.covidData.confirmed[1], true)})[br]
      위중증 : ${dot(this.covidData.critical[0])}(${dot(this.covidData.critical[1], true)})[br]
      사망자 : ${dot(this.covidData.deceased[0])}(${dot(this.covidData.deceased[1], true)})[br]
      `;
      return result.replace(/  +/g, '');
    }

    return this.covidData;
  }

  async getWeather(city: string, type?: string) {
    try {
      const response = await axios.get(
        encodeURI(`https://m.search.naver.com/search.naver?query=${city} 날씨`),
      );
      const $ = cheerio.load(response.data);

      const cityName = $('div.title_area > div > span').text();
      const weather = $('span.weather.before_slash').text();
      const temp = $(
        'div.weather_info > div > div._today > div.weather_graphic > div.temperature_text > strong',
      )
        .text()
        .replace('현재 온도', '');
      const tempLow = $(
        'li.week_item.today > div > div.cell_temperature > span > span.lowest',
      )
        .text()
        .replace('최저기온', '');
      const tempHigh = $(
        'li.week_item.today > div > div.cell_temperature > span > span.highest',
      )
        .text()
        .replace('최고기온', '');
      const pm = $(
        'div.weather_info > div > div.report_card_wrap > ul > li:nth-child(1) > a > span',
      ).text();
      const pmM = $(
        'div.weather_info > div > div.report_card_wrap > ul > li:nth-child(2) > a > span',
      ).text();
      const ultraviolet = $(
        'div.weather_info > div > div.report_card_wrap > ul > li.item_today.level4 > a > span',
      ).text();
      const sunset = $(
        'div.weather_info > div > div.report_card_wrap > ul > li.item_today.type_sun > a > span',
      ).text();

      let precipitation = '';
      let humidity = '';
      let wind: string[] = [];

      if (cityName !== '') {
        const summary = $('div.weather_info > div > div.temperature_info > dl')
          .text()
          .trim()
          .split(' ');
        precipitation = summary[1];
        humidity = summary[3];
        wind = [
          summary[4]?.toString()?.replace('바람(', '')?.replace(')', ''),
          summary[5],
        ];
      }

      if (type === 'text' || type === 'txt') {
        if (cityName === '') return '위치 정보를 찾을 수 없어요.';

        const result = `[ ${cityName.replace(cityName.split(' ')[0], '')}의 현재 날씨는 ${weather}! ][br]
          조회시각 : ${this.timeService.format('YYYY-MM-DD hh:mm:ss')}[br]
          [br]
          기온 : ${temp}(최저 ${tempLow}/최고 ${tempHigh})[br]
          바람 : ${wind[0]} ${wind[1]}[br]
          일몰시간 : ${sunset}[br]
          강수확률 : ${precipitation}[br]
          습도 : ${humidity}[br]
          (초)미세먼지 : ${pmM}, ${pm}[br]
          자외선 : ${ultraviolet}`;
        return result.replace(/  +/g, '');
      }

      return {
        city: cityName,
        weather,
        temp,
        temp_low: tempLow,
        temp_high: tempHigh,
        precipitation,
        humidity,
        pm,
        pm_m: pmM,
        ultraviolet,
        sunset,
        wind,
      };
    } catch (error) {
      this.logger.error(`날씨 정보 조회 오류: ${city}`, error.message);
      throw error;
    }
  }

  async getOlympicMedals() {
    try {
      const response = await axios.get(
        'https://m.search.naver.com/search.naver?query=올림픽',
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.3; WOW64; Trident/7.0)',
          },
        },
      );
      const $ = cheerio.load(response.data);

      const name = $(
        '#ct > section.sc.mcs_common_module.case_normal.color_7._olympic > div > div.sticky_wrap._sticky_wrap > div > div.title_area._title_area > h2 > span.area_text_title > strong',
      ).text();
      const grade = $(
        '#ct > section.sc.mcs_common_module.case_normal.color_7._olympic > div > div.sticky_wrap._sticky_wrap > div > div.title_area._title_area > div > span',
      ).text();
      const gold = $(
        '#ct > section.sc.mcs_common_module.case_normal.color_7._olympic > div > div.sticky_wrap._sticky_wrap > div > div.title_area._title_area > div > div > span.ico_medal.gold',
      )
        .text()
        .replace(/[^0-9]/g, '');
      const silver = $(
        '#ct > section.sc.mcs_common_module.case_normal.color_7._olympic > div > div.sticky_wrap._sticky_wrap > div > div.title_area._title_area > div > div > span.ico_medal.silver',
      )
        .text()
        .replace(/[^0-9]/g, '');
      const bronze = $(
        '#ct > section.sc.mcs_common_module.case_normal.color_7._olympic > div > div.sticky_wrap._sticky_wrap > div > div.title_area._title_area > div > div > span.ico_medal.bronze',
      )
        .text()
        .replace(/[^0-9]/g, '');

      if (name === '') throw new Error('올림픽 정보를 찾을 수 없습니다.');

      return { name, grade, gold, silver, bronze };
    } catch (error) {
      this.logger.error('올림픽 정보 조회 오류', error.message);
      throw error;
    }
  }
}
