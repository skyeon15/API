import axios, { AxiosInstance } from 'axios';
import { Logger } from '@nestjs/common';
import { truncateBody } from './log-utils.js';

const logger = new Logger('ExternalAPI');

function trySerialize(data: any) {
  if (!data) return data;

  // URLSearchParams 처리
  if (data instanceof URLSearchParams) {
    const obj: any = {};
    data.forEach((value, key) => {
      obj[key] = value;
    });
    return obj;
  }

  // 이미 객체이거나 문자열인 경우 그대로 반환 (Pino가 처리)
  return data;
}

function applyInterceptors(instance: AxiosInstance) {
  instance.interceptors.request.use((config) => {
    const { method, url, data, params } = config;
    
    // 외부 API 요청 로깅
    logger.log({
      msg: `[Outgoing Request] ${method?.toUpperCase()} ${url}`,
      externalReq: {
        method: method?.toUpperCase(),
        url: url,
        query: params,
        body: trySerialize(data),
      }
    });
    
    (config as any).metadata = { startTime: Date.now() };
    return config;
  }, (error) => {
    logger.error({
      msg: `[Outgoing Request Error] ${error.message}`,
      externalReq: {
        method: error.config?.method?.toUpperCase(),
        url: error.config?.url,
      },
      error: error.stack
    });
    return Promise.reject(error);
  });

  instance.interceptors.response.use((response) => {
    const { config, status, data } = response;
    const duration = Date.now() - (config as any).metadata?.startTime;
    
    // 외부 API 응답 로깅
    logger.log({
      msg: `[Outgoing Response] ${config.method?.toUpperCase()} ${config.url} ${status} (${duration}ms)`,
      externalRes: {
        statusCode: status,
        body: truncateBody(data),
      },
      duration
    });
    
    return response;
  }, (error) => {
    const { config, response } = error;
    const duration = config?.metadata?.startTime ? Date.now() - config.metadata.startTime : 0;
    
    if (response) {
      logger.error({
        msg: `[Outgoing Response Error] ${config?.method?.toUpperCase()} ${config?.url} ${response.status} (${duration}ms)`,
        externalRes: {
          statusCode: response.status,
          body: truncateBody(response.data),
        },
        duration
      });
    } else {
      logger.error({
        msg: `[Outgoing Network Error] ${error.message} (${duration}ms)`,
        externalReq: {
          method: config?.method?.toUpperCase(),
          url: config?.url,
        },
        duration
      });
    }
    
    return Promise.reject(error);
  });
}

export function setupAxiosLogger() {
  // 1. 기본 axios 인스턴스에 적용
  applyInterceptors(axios);

  // 2. axios.create()를 멍키 패치하여 이후 생성되는 모든 인스턴스에 적용
  // (HttpService 등에서 사용하는 인스턴스까지 캡처하기 위함)
  const originalCreate = axios.create;
  axios.create = function(...args) {
    const instance = originalCreate.apply(this, args);
    applyInterceptors(instance);
    return instance;
  };
}
