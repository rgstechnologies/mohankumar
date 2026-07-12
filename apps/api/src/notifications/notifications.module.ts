import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { CompanyRoleGuard } from '../companies/guards/company-role.guard';
import { PurchasesModule } from '../purchases/purchases.module';
import { NotificationsService } from './notifications.service';

class MarkReadDto {
  @IsString()
  @MaxLength(100)
  id!: string;
}

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId/notifications')
class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Actionable alerts: GST deadlines, dues, low stock' })
  list(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notifications.list(companyId, user.id);
  }

  @Post('read')
  @ApiOperation({ summary: 'Mark one alert read; returns the refreshed list' })
  markRead(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: MarkReadDto,
  ) {
    return this.notifications.markRead(companyId, user.id, dto.id);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all alerts read; returns the refreshed list' })
  markAllRead(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notifications.markAllRead(companyId, user.id);
  }
}

@Module({
  imports: [PurchasesModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
