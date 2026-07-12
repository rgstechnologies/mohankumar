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
import { Role } from '@prisma/client';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { CompanyRoles } from '../companies/decorators/company-roles.decorator';
import { CompanyRoleGuard } from '../companies/guards/company-role.guard';
import { AdjustLoyaltyDto } from './loyalty.dto';
import { LoyaltyService } from './loyalty.service';

@ApiTags('loyalty')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId/loyalty')
class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('customers')
  @ApiOperation({ summary: 'Customers with their loyalty points balance' })
  customers(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.loyalty.customers(companyId);
  }

  @Get('customers/:partyId/history')
  @ApiOperation({ summary: 'Points history for a customer' })
  history(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('partyId', ParseUUIDPipe) partyId: string,
  ) {
    return this.loyalty.history(companyId, partyId);
  }

  @Post('adjust')
  @CompanyRoles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT, Role.CASHIER)
  @ApiOperation({ summary: 'Redeem or adjust a customer’s points' })
  adjust(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: AdjustLoyaltyDto,
  ) {
    return this.loyalty.adjust(companyId, user.id, dto);
  }
}

@Module({
  controllers: [LoyaltyController],
  providers: [LoyaltyService],
})
export class LoyaltyModule {}
