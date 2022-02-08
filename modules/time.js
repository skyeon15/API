/**
 * time.js
 *
 * (c) 2020-2021 Wany
 *
 * @summary Datetime formatting / Datetime compare
 * @author Wany <sung@wany.io>
 */

 function formatDatetime(format, datetime) {
    if (!datetime || datetime == '' || datetime == 'now') {
      datetime = new Date();
    } else {
      datetime = new Date(datetime);
    }
  
    //year
    const YYYY = datetime.getFullYear().toString();
    const YY = YYYY.substr(-2);
  
    //month
    const M = datetime.getMonth() + 1;
    const MM = (M < 10 ? '0' : '') + M;
  
    //day
    const D = datetime.getDate();
    const DD = (D < 10 ? '0' : '') + D;
    const start = new Date(datetime.getFullYear(), 0, 0);
    const diff = datetime - start + (start.getTimezoneOffset() - datetime.getTimezoneOffset()) * 60 * 1000;
    const oneDay = 1000 * 60 * 60 * 24;
    let DDDa = Math.floor(diff / oneDay);
    DDDa = (DDDa < 10 ? '0' : '') + DDDa;
    DDDa = (DDDa < 100 ? '0' : '') + DDDa;
    const DDD = DDDa;
  
    //hour
    const h = datetime.getHours();
    const hh = (h < 10 ? '0' : '') + h;
  
    //minute
    const m = datetime.getMinutes();
    const mm = (m < 10 ? '0' : '') + m;
    const mmmm = h * 60 + m;
  
    //second
    const s = datetime.getSeconds();
    const ss = (s < 10 ? '0' : '') + s;
    const sssss = mmmm * 60 + s;
  
    //milisecond
    let CCC = datetime.getMilliseconds();
    if (CCC < 10) {
      CCC = '00' + CCC;
    } else if (CCC < 100) {
      CCC = '0' + CCC;
    }
    const CC = CCC.toString().slice(0, -1);
  
    let KH = '';
    if (1 <= hh * 1 && hh * 1 <= 5) {
      KH = '새벽';
    } else if (6 <= hh * 1 && hh * 1 <= 8) {
      KH = '아침';
    } else if (9 <= hh * 1 && hh * 1 <= 12) {
      KH = '낮';
    } else if (13 <= hh * 1 && hh * 1 <= 17) {
      KH = '오후';
    } else if (18 <= hh * 1 && hh * 1 <= 21) {
      KH = '저녁';
    } else if ((22 <= hh * 1 && hh * 1 <= 24) || hh * 1 == 0) {
      KH = '밤';
    }
  
    const E = datetime.getTime();
  
    format = format + '';
  
    format = format.replace(/YYYY/g, YYYY); // 4자리 년도
    format = format.replace(/YY/g, YY); // 2자리 년
    format = format.replace(/MM/g, MM); // 2자리 달 (연 중, 0#)
    format = format.replace(/M/g, M); // 1자리 달 (연 중)
    format = format.replace(/DDD/g, DDD); // 3자리 일 (연 중)
    format = format.replace(/DD/g, DD); // 2자리 일 (월 중, 0#)
    format = format.replace(/D/g, D); // 1자리 일 (월 중)
    format = format.replace(/hh/g, hh); // 2자리 시 (일 중, 0#)
    format = format.replace(/h/g, h); // 1자리 시 (일 중)
    format = format.replace(/mmmm/g, mmmm); // 4자리 분 (일 중, 000#)
    format = format.replace(/mm/g, mm); // 2자리 분 (시 중, 0#)
    format = format.replace(/m/g, m); // 1자리 분 (시 중)
    format = format.replace(/sssss/g, sssss); // 4자리 초 (일 중, 0000#)
    format = format.replace(/ss/g, ss); // 2자리 초 (분 중, 0#)
    format = format.replace(/s/g, s); // 1자리 초 (분 중)
    format = format.replace(/CCC/g, CCC); // 3자리 밀리초 (초 중, 00#)
    format = format.replace(/CC/g, CC); // 2자리 밀리초 (초 중, 0#)
    format = format.replace(/KH/g, KH); // 한글 시간 (일 중)
    format = format.replace(/E/g, E); // datetime.getTime();
  
    return format;
  }
  module.exports.format = formatDatetime;