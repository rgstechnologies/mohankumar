import {
  Body,
  Controller,
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
import { AccountingModule } from '../accounting/accounting.module';
import { CreatePartyTransferDto } from './party-transfers.dto';
import { PartyTransfersService } from './party-transfers.service';

@ApiTags('party-transfers')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId/party-transfers')
class PartyTransfersController {
  constructor(private readonly transfers: PartyTransfersService) {}

  @Post()
  @CompanyRoles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Transfer an outstanding balance between two parties' })
  create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePartyTransferDto,
  ) {
    return this.transfers.create(companyId, user.id, dto);
  }
}

@Module({
  imports: [AccountingModule],
  controllers: [PartyTransfersController],
  providers: [PartyTransfersService],
})
export class PartyTransfersModule {}
