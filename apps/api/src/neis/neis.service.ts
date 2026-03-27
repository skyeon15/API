import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { TimeService } from '../common/time.service.js';

@Injectable()
export class NeisService {
  private readonly logger = new Logger(NeisService.name);

  constructor(private readonly timeService: TimeService) {}

  async getSchoolLunch(schoolName: string) {
    const today = this.timeService.format("YYMMDD");
    this.logger.log(`급식 조회 요청: ${schoolName}, 날짜: ${today}`);

    try {
      // 학교 정보 확인
      const schoolInfoRes = await axios.get(encodeURI(`https://open.neis.go.kr/hub/schoolInfo?Type=json&SCHUL_NM=${schoolName}`));
      const schoolJson = schoolInfoRes.data;

      if (!schoolJson.schoolInfo) {
        return {
          STATUS: "오류-학교이름",
          NAME: schoolName,
          datetime: this.timeService.format('YYYY-MM-DD hh:mm:ss', new Date())
        };
      }

      const name = schoolJson.schoolInfo[1].row[0].SCHUL_NM;
      const educationCode = schoolJson.schoolInfo[1].row[0].ATPT_OFCDC_SC_CODE;
      const schoolCode = schoolJson.schoolInfo[1].row[0].SD_SCHUL_CODE;

      // 급식 정보 조회
      const mealRes = await axios.get(`https://open.neis.go.kr/hub/mealServiceDietInfo?Type=json&ATPT_OFCDC_SC_CODE=${educationCode}&SD_SCHUL_CODE=${schoolCode}&MLSV_YMD=${today}`);
      const mealJson = mealRes.data;

      if (mealJson.mealServiceDietInfo) {
        const meals = mealJson.mealServiceDietInfo[1].row.map((m: any) => ({
          meal: m.MMEAL_SC_NM,
          dish: m.DDISH_NM
        }));

        return {
          STATUS: "정상",
          NAME: name,
          datetime: this.timeService.format('YYYY-MM-DD hh:mm:ss', new Date()),
          MEALS: meals
        };
      } else {
        return {
          STATUS: "오류-급식없음",
          NAME: name,
          datetime: this.timeService.format('YYYY-MM-DD hh:mm:ss', new Date())
        };
      }
    } catch (error) {
      this.logger.error(`NEIS API 오류: ${schoolName}`, error.message);
      return {
        STATUS: "오류-급식서버오류",
        NAME: schoolName,
        datetime: this.timeService.format('YYYY-MM-DD hh:mm:ss', new Date())
      };
    }
  }
}
