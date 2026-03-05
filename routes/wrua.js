var express = require('express');
var router = express.Router();
const axios = require('axios');
const ical = require('node-ical');

// Helper: format private summary as "HH-HH시 [장소]"
const padHour = (h) => String(h).padStart(2, '0');
const getHour = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.getHours();
};
const formatPrivateSummary = (start, end, originalSummary) => {
  const sh = getHour(start);
  const eh = getHour(end);
  if (sh === null || eh === null) return '비공개';
  const timePart = `${padHour(sh)}-${padHour(eh)}시`;

  // If both hours are 00 -> all-day
  if (padHour(sh) === '00' && padHour(eh) === '00') {
    const allDay = '종일';
    if (originalSummary && typeof originalSummary === 'string') {
      const dashIndex = originalSummary.indexOf('-');
      if (dashIndex > 0) {
        const beforeDash = originalSummary.substring(0, dashIndex).trim();
        if (beforeDash.length > 0) return `${allDay} ${beforeDash}`;
      }
    }
    return allDay;
  }

  if (originalSummary && typeof originalSummary === 'string') {
    const dashIndex = originalSummary.indexOf('-');
    if (dashIndex > 0) {
      const beforeDash = originalSummary.substring(0, dashIndex).trim();
      if (beforeDash.length > 0) {
        return `${timePart} ${beforeDash}`;
      }
    }
  }
  return timePart;
};

/* GET users listing. */
router.get('/', async function (req, res, next) {
  try {
    // 쿼리에서 name 가져오기
    const userName = req.query.name;

    // name에 따른 사용자 설정 (URL과 비공개 설정 통합)
    const userConfig = {
      '광현': {
        url: 'https://calendar.google.com/calendar/ical/skyyeon15%40gmail.com/private-abc381306c00c039e636d91f4f6cc5a8/basic.ics',
        isPrivate: true  // 비공개로 표시
      },
      '에케': {
        url: 'https://calendar.google.com/calendar/ical/skyyeon15%40gmail.com/private-abc381306c00c039e636d91f4f6cc5a8/basic.ics',
        isPrivate: true  // 비공개로 표시
      },
      // '개발': {
      //   url: 'https://calendar.google.com/calendar/ical/skyyeon15%40gmail.com/private-abc381306c00c039e636d91f4f6cc5a8/basic.ics',
      //   isPrivate: false  // 원본 그대로 표시
      // },
      // 다른 사용자 추가 예시:
      // '철수': {
      //   url: 'https://calendar.google.com/calendar/ical/chulsoo%40gmail.com/private-xxxxxx/basic.ics',
      //   isPrivate: true
      // },
    };

    // name이 없거나 매핑에 없는 경우 에러 반환
    if (!userName || !userConfig[userName]) {
      return res.status(400).json({
        error: 'Invalid or missing name parameter',
        availableNames: Object.keys(userConfig)
      });
    }

    // Google Calendar ICS 파일 가져오기
    const config = userConfig[userName];
    const calendarUrl = config.url;
    const response = await axios.get(calendarUrl);
    const icsData = response.data;

    // ICS 파싱
    const events = await ical.async.parseICS(icsData);

    // 오늘 날짜 계산 (오늘 00:00:00)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 필터링 및 수정된 이벤트 배열
    const processedEvents = [];
    const isPrivate = config.isPrivate;


    for (let k in events) {
      if (events.hasOwnProperty(k)) {
        const ev = events[k];
        if (ev.type === 'VEVENT') {
          const eventEnd = new Date(ev.end);

          // 종료 시간이 오늘 이전인 일정은 제외 (오늘 이후 종료되는 일정만 포함)
          if (eventEnd >= today) {
            processedEvents.push({
              start: ev.start,
              end: ev.end,
              summary: isPrivate ? formatPrivateSummary(ev.start, ev.end, ev.summary) : (ev.summary || '제목 없음'),
              location: ev.location || '',
              // description 제거 (포함하지 않음)
            });
          }
        }
      }
    }

    // 응답 반환
    res.json({
      name: userName,
      events: processedEvents
    });

  } catch (error) {
    console.error('Error fetching calendar:', error);
    res.status(500).json({
      error: 'Failed to fetch calendar',
      message: error.message
    });
  }
});

// POST /together - 함께한 일정 검색
// body: { name: '이름' }
// description 마지막 줄이 'w.이름1,이름2,...' 형식인 이벤트 중 해당 이름이 포함된 일정의 start/end 반환
router.post('/together', async function (req, res, next) {
  try {
    const { name } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({
        error: 'Invalid or missing name parameter',
        example: { name: '김성연' }
      });
    }

    const searchName = name.trim();

    // 캘린더 ICS URL (고정)
    const calendarUrl = 'https://calendar.google.com/calendar/ical/skyyeon15%40gmail.com/private-abc381306c00c039e636d91f4f6cc5a8/basic.ics';
    const response = await axios.get(calendarUrl);
    const icsData = response.data;

    // ICS 파싱
    const events = await ical.async.parseICS(icsData);

    // 최근 12개월 범위 계산
    const now = new Date();
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const matchedEvents = [];

    for (let k in events) {
      if (!events.hasOwnProperty(k)) continue;
      const ev = events[k];
      if (ev.type !== 'VEVENT') continue;

      // 최근 12개월 이내 이벤트만 포함
      const eventStart = new Date(ev.start);
      if (eventStart < twelveMonthsAgo) continue;
      const description = ev.description || '';
      const lines = description.split(/\r?\n/);

      // 마지막 비어있지 않은 줄 찾기
      let lastLine = '';
      for (let i = lines.length - 1; i >= 0; i--) {
        const trimmed = lines[i].trim();
        if (trimmed.length > 0) {
          lastLine = trimmed;
          break;
        }
      }

      // 'w.이름1,이름2,...' 형식 확인
      if (!lastLine.startsWith('w.')) continue;

      const participantStr = lastLine.slice(2); // 'w.' 제거
      const participants = participantStr.split(',').map(p => p.trim());

      // 검색 이름이 포함되어 있는지 확인
      if (!participants.includes(searchName)) continue;

      // summary에서 시간 제외, 장소명만 추출 (대시 앞 부분)
      const rawSummary = ev.summary || '';
      const dashIndex = rawSummary.indexOf('-');
      const summaryLabel = dashIndex > 0
        ? rawSummary.substring(0, dashIndex).trim()
        : rawSummary.trim() || '제목 없음';

      matchedEvents.push({
        start: ev.start,
        end: ev.end,
        summary: summaryLabel,
        location: ev.location || ''
      });
    }

    // 시작 시간 기준 정렬
    matchedEvents.sort((a, b) => new Date(a.start) - new Date(b.start));

    res.json({
      name: searchName,
      count: matchedEvents.length,
      events: matchedEvents
    });

  } catch (error) {
    console.error('Error in /together:', error);
    res.status(500).json({
      error: 'Failed to search calendar',
      message: error.message
    });
  }
});

module.exports = router;

