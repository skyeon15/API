import { Injectable } from '@nestjs/common';

@Injectable()
export class TimeService {
  format(format: string, datetime?: Date | string | number | 'now'): string {
    let date: Date;
    if (!datetime || datetime === '' || datetime === 'now') {
      date = new Date();
    } else {
      date = new Date(datetime);
    }

    // year
    const YYYY = date.getFullYear().toString();
    const YY = YYYY.slice(-2);

    // month
    const M = date.getMonth() + 1;
    const MM = (M < 10 ? '0' : '') + M;

    // day
    const D = date.getDate();
    const DD = (D < 10 ? '0' : '') + D;
    const start = new Date(date.getFullYear(), 0, 0);
    const diff =
      date.getTime() -
      start.getTime() +
      (start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000;
    const oneDay = 1000 * 60 * 60 * 24;
    let DDDa = Math.floor(diff / oneDay).toString();
    DDDa = DDDa.padStart(3, '0');
    const DDD = DDDa;

    // hour
    const h = date.getHours();
    const hh = (h < 10 ? '0' : '') + h;

    // minute
    const m = date.getMinutes();
    const mm = (m < 10 ? '0' : '') + m;
    const mmmm = h * 60 + m;

    // second
    const s = date.getSeconds();
    const ss = (s < 10 ? '0' : '') + s;
    const sssss = mmmm * 60 + s;

    // millisecond
    const CCC = date.getMilliseconds().toString().padStart(3, '0');
    const CC = CCC.slice(0, -1);

    let KH = '';
    if (1 <= h && h <= 5) {
      KH = '새벽';
    } else if (6 <= h && h <= 8) {
      KH = '아침';
    } else if (9 <= h && h <= 12) {
      KH = '낮';
    } else if (13 <= h && h <= 17) {
      KH = '오후';
    } else if (18 <= h && h <= 21) {
      KH = '저녁';
    } else if ((22 <= h && h <= 24) || h === 0) {
      KH = '밤';
    }

    const E = date.getTime().toString();

    let res = format;
    res = res.replace(/YYYY/g, YYYY);
    res = res.replace(/YY/g, YY);
    res = res.replace(/MM/g, MM);
    res = res.replace(/M/g, M.toString());
    res = res.replace(/DDD/g, DDD);
    res = res.replace(/DD/g, DD);
    res = res.replace(/D/g, D.toString());
    res = res.replace(/hh/g, hh);
    res = res.replace(/h/g, h.toString());
    res = res.replace(/mmmm/g, mmmm.toString());
    res = res.replace(/mm/g, mm);
    res = res.replace(/m/g, m.toString());
    res = res.replace(/sssss/g, sssss.toString());
    res = res.replace(/ss/g, ss);
    res = res.replace(/s/g, s.toString());
    res = res.replace(/CCC/g, CCC);
    res = res.replace(/CC/g, CC);
    res = res.replace(/KH/g, KH);
    res = res.replace(/E/g, E);

    return res;
  }
}
