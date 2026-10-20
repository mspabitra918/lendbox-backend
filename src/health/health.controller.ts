import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Sequelize } from 'sequelize-typescript';
import { ApiWrapped } from '../common/decorators/api-wrapped.decorator';
import { ErrorResponseDto } from '../common/dto/api-response.dto';

@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly sequelize: Sequelize) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness', description: 'Process is up. Does not touch the database.' })
  @ApiWrapped(null, { example: { status: 'ok', uptimeSeconds: 1234 } })
  live() {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Get()
  @ApiOperation({ summary: 'Readiness', description: 'Checks database connectivity and that migrations have run. 503 when not ready.' })
  @ApiWrapped(null, { example: { status: 'ok', database: 'up', migrations: 9, uptimeSeconds: 1234, timestamp: '2026-10-17T12:00:00.000Z' } })
  @ApiServiceUnavailableResponse({ type: ErrorResponseDto })
  async ready() {
    try {
      const [rows] = await this.sequelize.query('SELECT COUNT(*)::int AS n FROM sequelize_meta');
      return {
        status: 'ok',
        database: 'up',
        migrations: (rows as { n: number }[])[0]?.n ?? 0,
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({ code: 'NOT_READY', message: 'Database unavailable or not migrated.' });
    }
  }
}
