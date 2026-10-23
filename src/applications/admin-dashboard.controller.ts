import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../auth/decorators/admin-only.decorator';
import { ApiWrapped } from '../common/decorators/api-wrapped.decorator';
import { AdminApplicationsService } from './admin-applications.service';

@ApiTags('Admin: dashboard')
@AdminOnly()
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly service: AdminApplicationsService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Dashboard statistics' })
  @ApiWrapped(null, {
    example: {
      totalApplications: 137,
      submitted: { today: 4, last7Days: 22, last30Days: 88 },
      byStatus: { received: 61, approved: 30, declined: 25, withdrawn: 6, funded: 15 },
      requestedAmountByStatus: { received: 325000, approved: 160000, declined: 98000, withdrawn: 21000, funded: 87000 },
      emailDelivery: { queued: 1, sending: 0, sent: 402, failed: 2 },
      generatedAt: '2026-10-17T12:00:00.000Z',
    },
  })
  stats() {
    return this.service.stats();
  }
}
