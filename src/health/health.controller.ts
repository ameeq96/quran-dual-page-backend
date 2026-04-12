import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      app: process.env.APP_NAME || 'quran-admin-backend',
      env: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    };
  }
}
