const winston = require('winston');
const path = require('path');

// JSON 포맷 정의
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// 원본 로거 생성
const baseLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    new winston.transports.Console({
      format: jsonFormat
    }),
    new winston.transports.File({
      filename: 'data/logs/error.log',
      level: 'error',
      format: jsonFormat
    }),
    new winston.transports.File({
      filename: 'data/logs/combined.log',
      format: jsonFormat
    })
  ]
});

// 프로덕션 환경에서는 콘솔 출력을 제거할 수 있음
if (process.env.NODE_ENV === 'production') {
  baseLogger.remove(winston.transports.Console);
}

// 호출 위치를 자동으로 추가하는 래퍼
const logger = {};
['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'].forEach(level => {
  logger[level] = function(message, meta = {}) {
    const stack = new Error().stack;
    const stackLines = stack.split('\n');
    
    // 실제 호출한 파일 찾기
    for (let i = 2; i < stackLines.length; i++) {
      const line = stackLines[i];
      if (!line.includes('logger.js') && !line.includes('node_modules') && !line.includes('node:')) {
        const match = line.match(/\((.+):(\d+):(\d+)\)/) || line.match(/at\s+(.+):(\d+):(\d+)/);
        if (match) {
          const fullPath = match[1].trim();
          const fileName = fullPath.split('\\').pop().split('/').pop();
          meta.file = fileName;
          meta.line = match[2];
          break;
        }
      }
    }
    
    baseLogger[level](message, meta);
  };
});

module.exports = logger;
