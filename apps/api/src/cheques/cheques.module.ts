import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { BranchScope } from '../companies/decorators/branch-scope.decorator';
import { CompanyRoles } from '../companies/decorators/company-roles.decorator';
import { CompanyRoleGuard } from '../companies/guards/company-role.guard';
import { CreateChequeDto, SetChequeStatusDto } from './dto/cheque.dto';
import { ChequesService } from './cheques.service';

const ENTRY_ROLES = [
  Role.OWNER,
  Role.ADMIN,
  Role.ACCOUNTANT,
  Role.CASHIER,
  Role.BRANCH_MANAGER,
] as const;

@ApiTags('cheques')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId/cheques')
class ChequesController {
  constructor(private readonly cheques: ChequesService) {}

  @Get()
  @ApiOperation({ summary: 'List the cheque register' })
  list(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @BranchScope() branchScope?: string,
  ) {
    return this.cheques.list(companyId, branchScope);
  }

  @Post()
  @CompanyRoles(...ENTRY_ROLES)
  @ApiOperation({ summary: 'Record a cheque received or issued' })
  create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateChequeDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.cheques.create(companyId, user.id, dto, branchScope);
  }

  @Patch(':chequeId')
  @CompanyRoles(...ENTRY_ROLES)
  @ApiOperation({ summary: 'Edit a pending cheque' })
  update(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('chequeId', ParseUUIDPipe) chequeId: string,
    @Body() dto: CreateChequeDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.cheques.update(companyId, chequeId, dto, branchScope);
  }

  @Patch(':chequeId/status')
  @CompanyRoles(...ENTRY_ROLES)
  @ApiOperation({ summary: 'Mark cleared / bounced / cancelled / reopen' })
  setStatus(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('chequeId', ParseUUIDPipe) chequeId: string,
    @Body() dto: SetChequeStatusDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.cheques.setStatus(companyId, chequeId, dto, branchScope);
  }
}

@Module({
  controllers: [ChequesController],
  providers: [ChequesService],
})
export class ChequesModule {}
