import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import { ApiExcludeEndpoint } from '@nestjs/swagger';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Get()
  @ApiExcludeEndpoint()
  getHello(): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>파란대나무숲 API</title>
          <link rel="icon" type="image/svg+xml" href="/public/favicon.svg">
          <style>
            body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f4f6f8; }
            .card { padding: 40px; background: white; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; }
            img { width: 150px; margin-bottom: 20px; }
            h1 { color: #333; margin: 0; }
            p { color: #666; margin-top: 10px; }
            a { color: #007bff; text-decoration: none; margin: 0 10px; }
          </style>
        </head>
        <body>
          <div class="card">
            <img src="/public/logo.png" alt="Logo">
            <h1>파란대나무숲 API 서버</h1>
            <p>API 서비스가 정상 작동 중입니다.</p>
            <div style="margin-top: 20px;">
              <a href="/api">API 문서</a>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  @Get('news')
  @ApiExcludeEndpoint()
  getNews(): string {
    return '에케 API - 뉴스 (Legacy)';
  }
}
