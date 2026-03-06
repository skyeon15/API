var express = require('express');
var router = express.Router();
const axios = require('axios');
const ical = require('node-ical');
const fs = require('fs');
const path = require('path');

const IP_STORAGE_PATH = path.join(__dirname, '../data/together_ip_names.json');

// Helper: IP 매핑 로드
const getIpMappings = () => {
  try {
    if (!fs.existsSync(IP_STORAGE_PATH)) return {};
    return JSON.parse(fs.readFileSync(IP_STORAGE_PATH, 'utf8'));
  } catch (e) {
    console.error('Failed to read IP mapping file:', e);
    return {};
  }
};

// Helper: IP 매핑 저장
const saveIpMapping = (ip, name) => {
  try {
    const mappings = getIpMappings();
    mappings[ip] = name;
    fs.writeFileSync(IP_STORAGE_PATH, JSON.stringify(mappings, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save IP mapping file:', e);
  }
};

// Helper: IP 매핑 삭제
const deleteIpMapping = (ip) => {
  try {
    const mappings = getIpMappings();
    if (mappings[ip]) {
      delete mappings[ip];
      fs.writeFileSync(IP_STORAGE_PATH, JSON.stringify(mappings, null, 2), 'utf8');
    }
  } catch (e) {
    console.error('Failed to delete IP mapping:', e);
  }
};

// 서버 세션 동안 IP 고정을 무시할 IP 목록
const unlockedIps = new Set();

// name에 따른 사용자 설정 (URL과 비공개 설정 통합)
// 새 사용자 추가 예시:
// '철수': {
//   url: 'https://calendar.google.com/calendar/ical/chulsoo%40gmail.com/private-xxxxxx/basic.ics',
//   isPrivate: true
// },
const userConfig = {
  '광현': {
    url: 'https://calendar.google.com/calendar/ical/skyyeon15%40gmail.com/private-abc381306c00c039e636d91f4f6cc5a8/basic.ics',
    isPrivate: true
  },
  '에케': {
    url: 'https://calendar.google.com/calendar/ical/skyyeon15%40gmail.com/private-abc381306c00c039e636d91f4f6cc5a8/basic.ics',
    isPrivate: true
  },
  // '개발': {
  //   url: 'https://calendar.google.com/calendar/ical/skyyeon15%40gmail.com/private-abc381306c00c039e636d91f4f6cc5a8/basic.ics',
  //   isPrivate: false  // 원본 그대로 표시
  // },
};

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

// IP별 검색 이름 캐싱 (파일로 관리)
// const ipNameMap = new Map(); (삭제됨)

// POST /together?name=캘린더소유자 - 함께한 일정 검색
// query: { name: '캘린더 소유자 이름' } → userConfig에서 ICS URL 결정
// body: { withName: '검색할 이름' }
router.post('/together', async function (req, res, next) {
  try {
    const { withName } = req.body;

    if (!withName || typeof withName !== 'string') {
      return res.status(400).json({
        error: 'Invalid or missing body parameter: withName',
        example: { withName: '홍길동' }
      });
    }

    const searchName = withName.trim();

    // 쿼리 파라미터로 캘린더 소유자 결정
    const calendarOwner = req.query.name;

    if (!calendarOwner || !userConfig[calendarOwner]) {
      return res.status(400).json({
        error: 'Invalid or missing query parameter: name',
        availableNames: Object.keys(userConfig)
      });
    }

    // IP 확인 (프록시 환경 고려)
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // 특수 명령어 처리: 001015 입력 시 IP 고정 해제 및 세션 내 무시
    if (searchName === '001015') {
      deleteIpMapping(clientIp);
      unlockedIps.add(clientIp);
      return res.json({
        success: true,
        message: '관리자 모드 활성화!'
      });
    }

    const isUnlocked = unlockedIps.has(clientIp);

    // 이미 다른 이름으로 검색 성공한 기록이 있는지 확인 (파일에서 로드, bypass가 아닐 때만)
    if (!isUnlocked) {
      const ipMappings = getIpMappings();
      if (ipMappings[clientIp]) {
        const boundName = ipMappings[clientIp];
        if (boundName !== searchName) {
          return res.status(403).json({
            error: 'Restricted access',
            message: '이름은 한 명만 검색할 수 있어요.'
          });
        }
      }
    }

    // userConfig에서 캘린더 URL 결정
    const calendarUrl = userConfig[calendarOwner].url;
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

      // 이벤트의 description에 검색 이름이 포함되어 있는지 확인
      if (!description.includes(searchName)) continue;

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

    // 결과가 1개 이상일 때만 해당 IP를 이 이름으로 고정 (파일에 저장, 무시 설정이 안 된 경우만)
    if (!isUnlocked) {
      const currentMappings = getIpMappings();
      if (matchedEvents.length > 0 && !currentMappings[clientIp]) {
        saveIpMapping(clientIp, searchName);
      }
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

