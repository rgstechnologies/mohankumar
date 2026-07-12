import {
  Body,
  Controller,
  Get,
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
import { BranchScope } from '../companies/decorators/branch-scope.decorator';
import { CompanyRoles } from '../companies/decorators/company-roles.decorator';
import { CompanyRoleGuard } from '../companies/guards/company-role.guard';
import { CreateStockTransferDto } from './dto/stock-transfer.dto';
import { StockTransfersService } from './stock-transfers.service';

const TRANSFER_ROLES = [
  Role.OWNER,
  Role.ADMIN,
  Role.ACCOUNTANT,
  Role.BRANCH_MANAGER,
] as const;

@ApiTags('stock-transfers')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId/stock-transfers')
export class StockTransfersController {
  constructor(private readonly transfers: StockTransfersService) {}

  @Get('by-branch')
  @ApiOperation({ summary: 'Branch-wise stock matrix (per item, per location)' })
  byBranch(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.transfers.stockByBranch(companyId);
  }

  @Get()
  @ApiOperation({ summary: 'List stock transfers' })
  list(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @BranchScope() branchScope?: string,
  ) {
    return this.transfers.list(companyId, branchScope);
  }

  @Post()
  @CompanyRoles(...TRANSFER_ROLES)
  @ApiOperation({ summary: 'Move stock between branches (validates source availability)' })
  create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateStockTransferDto,
    @BranchScope() branchScope?: string,
  ) {
    return this.transfers.create(companyId, user.id, dto, branchScope);
  }

  @Post(':transferId/cancel')
  @CompanyRoles(...TRANSFER_ROLES)
  @ApiOperation({ summary: 'Cancel a transfer (reverses the stock movement)' })
  cancel(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('transferId', ParseUUIDPipe) transferId: string,
    @BranchScope() branchScope?: string,
  ) {
    return this.transfers.cancel(companyId, transferId, branchScope);
  }
}
