import { Injectable, Logger, InternalServerErrorException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { TimeService } from '../common/time.service.js';
import { HttpService } from '@nestjs/axios';
import ical from 'node-ical';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';

// Zod schemas for validation
const VEventSchema = z.object({
  type: z.literal('VEVENT'),
  start: z.union([z.date(), z.string().pipe(z.coerce.date())]),
  end: z.union([z.date(), z.string().pipe(z.coerce.date())]),
  summary: z.string().optional().default('제목 없음'),
  location: z.string().optional().default(''),
  description: z.string().optional().default(''),
});

const SearchBodySchema = z.object({
  withName: z.string().min(1, '성함 또는 검색어를 입력해주세요.'),
});

@Injectable()
export class WruaService {
  private readonly logger = new Logger(WruaService.name);
  private readonly IP_STORAGE_PATH = path.join(process.cwd(), 'data', 'together_ip_names.json');
  private readonly unlockedIps = new Set<string>();

  private readonly userConfig = {
    '광현': {
      url: 'https://calendar.google.com/calendar/ical/skyyeon15%40gmail.com/private-abc381306c00c039e636d91f4f6cc5a8/basic.ics',
      isPrivate: true
    },
    '에케': {
      url: 'https://calendar.google.com/calendar/ical/skyyeon15%40gmail.com/private-abc381306c00c039e636d91f4f6cc5a8/basic.ics',
      isPrivate: true
    },
  };

  constructor(
    private readonly httpService: HttpService,
    private readonly timeService: TimeService
  ) {
    // Ensure data directory exists
    const dataDir = path.dirname(this.IP_STORAGE_PATH);
    if (!fs.existsSync(dataDir)) {
      this.logger.log(`Creating directory: ${dataDir}`);
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  // Helper: IP 매핑 로드
  private getIpMappings(): Record<string, string> {
    try {
      if (!fs.existsSync(this.IP_STORAGE_PATH)) return {};
      return JSON.parse(fs.readFileSync(this.IP_STORAGE_PATH, 'utf8'));
    } catch (e) {
      this.logger.error('Failed to read IP mapping file:', e);
      return {};
    }
  }

  // Helper: IP 매핑 저장
  private saveIpMapping(ip: string, name: string) {
    try {
      const mappings = this.getIpMappings();
      mappings[ip] = name;
      fs.writeFileSync(this.IP_STORAGE_PATH, JSON.stringify(mappings, null, 2), 'utf8');
    } catch (e) {
      this.logger.error('Failed to save IP mapping file:', e);
    }
  }

  // Helper: IP 매핑 삭제
  private deleteIpMapping(ip: string) {
    try {
      const mappings = this.getIpMappings();
      if (mappings[ip]) {
        delete mappings[ip];
        fs.writeFileSync(this.IP_STORAGE_PATH, JSON.stringify(mappings, null, 2), 'utf8');
      }
    } catch (e) {
      this.logger.error('Failed to delete IP mapping:', e);
    }
  }

  private padHour(h: number) {
    return String(h).padStart(2, '0');
  }

  private getHour(d: any) {
    if (!d) return null;
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.getHours();
  }

  private formatPrivateSummary(start: any, end: any, originalSummary: string) {
    const sh = this.getHour(start);
    const eh = this.getHour(end);
    if (sh === null || eh === null) return '비공개';
    const timePart = `${this.padHour(sh)}-${this.padHour(eh)}시`;

    // If both hours are 00 -> all-day
    if (this.padHour(sh) === '00' && this.padHour(eh) === '00') {
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
  }

  async getEvents(userName: string) {
    if (!userName || !this.userConfig[userName]) {
      throw new BadRequestException({
        error: 'Invalid or missing name parameter',
        availableNames: Object.keys(this.userConfig)
      });
    }

    const config = this.userConfig[userName];
    const calendarUrl = config.url;

    try {
      const response = await firstValueFrom(this.httpService.get(calendarUrl));
      const icsData = response.data;
      const events = await ical.async.parseICS(icsData);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const processedEvents: any[] = [];
      const isPrivate = config.isPrivate;

      for (let k in events) {
        if (Object.prototype.hasOwnProperty.call(events, k)) {
          const rawEvent = events[k];
          const parseResult = VEventSchema.safeParse(rawEvent);
          if (!parseResult.success) continue;

          const ev = parseResult.data;
          const eventEnd = new Date(ev.end);
          if (eventEnd >= today) {
            processedEvents.push({
              start_datetime: this.timeService.format('YYYY-MM-DD hh:mm:ss', ev.start),
              end_datetime: this.timeService.format('YYYY-MM-DD hh:mm:ss', ev.end),
              summary: isPrivate ? this.formatPrivateSummary(ev.start, ev.end, ev.summary) : ev.summary,
              location: ev.location,
            });
          }
        }
      }

      return {
        name: userName,
        events: processedEvents
      };

    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error('Error fetching calendar:', error);
      throw new InternalServerErrorException({
        error: 'Failed to fetch calendar',
        message: error.message
      });
    }
  }

  async searchTogether(calendarOwner: string, body: any, clientIp: string) {
    // 2. Body validation with Zod
    const bodyResult = SearchBodySchema.safeParse(body);
    if (!bodyResult.success) {
      throw new BadRequestException({
        error: 'Validation failed',
        message: bodyResult.error.issues[0].message,
        example: { withName: '에케' }
      });
    }

    const { withName } = bodyResult.data;
    const searchName = withName.trim();

    if (!calendarOwner || !this.userConfig[calendarOwner]) {
      throw new BadRequestException({
        error: 'Invalid or missing query parameter: name',
        availableNames: Object.keys(this.userConfig)
      });
    }

    // Admin unlock command
    if (searchName === '001015') {
      this.deleteIpMapping(clientIp);
      this.unlockedIps.add(clientIp);
      return {
        success: true,
        message: '관리자 모드 활성화!'
      };
    }

    const isUnlocked = this.unlockedIps.has(clientIp);

    if (!isUnlocked) {
      const ipMappings = this.getIpMappings();
      if (ipMappings[clientIp]) {
        const boundName = ipMappings[clientIp];
        if (boundName !== searchName) {
          throw new ForbiddenException({
            error: 'Restricted access',
            message: '이름은 한 명만 검색할 수 있어요.'
          });
        }
      }
    }

    const calendarUrl = this.userConfig[calendarOwner].url;

    try {
      const response = await firstValueFrom(this.httpService.get(calendarUrl));
      const icsData = response.data;
      const events = await ical.async.parseICS(icsData);

      const now = new Date();
      const twelveMonthsAgo = new Date(now);
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

      const matchedEvents: any[] = [];

      for (let k in events) {
        if (!Object.prototype.hasOwnProperty.call(events, k)) continue;
        const rawEvent = events[k];
        // 3. Zod validation for each search result candidate
        const parseResult = VEventSchema.safeParse(rawEvent);
        if (!parseResult.success) continue;

        const ev = parseResult.data;
        const eventStart = new Date(ev.start);
        if (eventStart < twelveMonthsAgo) continue;
        const description = ev.description;

        if (!description.includes(searchName)) continue;

        const rawSummary = ev.summary;
        const dashIndex = rawSummary.indexOf('-');
        const summaryLabel = dashIndex > 0
          ? rawSummary.substring(0, dashIndex).trim()
          : rawSummary.trim();

        matchedEvents.push({
          start_datetime: this.timeService.format('YYYY-MM-DD hh:mm:ss', ev.start),
          end_datetime: this.timeService.format('YYYY-MM-DD hh:mm:ss', ev.end),
          summary: summaryLabel,
          location: ev.location
        });
      }

      if (!isUnlocked) {
        const currentMappings = this.getIpMappings();
        if (matchedEvents.length > 0 && !currentMappings[clientIp]) {
          this.saveIpMapping(clientIp, searchName);
        }
      }

      matchedEvents.sort((a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime());

      return {
        name: searchName,
        count: matchedEvents.length,
        events: matchedEvents
      };

    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ForbiddenException) throw error;
      this.logger.error('Error in searchTogether:', error);
      throw new InternalServerErrorException({
        error: 'Failed to search calendar',
        message: error.message
      });
    }
  }
}
