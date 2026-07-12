import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import { CreateExpenseDto, CreateOtherIncomeDto } from './dto/expense.dto';
import { ExpensesService } from './expenses.service';

const ENTRY_ROLES = [Role.OWNER, Role.ADMIN, Role.ACCOUNTANT, Role.CASHIER] as const;

@ApiTags('expenses')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId/expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  @ApiOperation({ summary: 'List expenses and other income' })
  list(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.expenses.list(companyId);
  }

  @Post()
  @CompanyRoles(...ENTRY_ROLES)
  @ApiOperation({ summary: 'Record a business expense' })
  createExpense(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.expenses.createExpense(companyId, user.id, dto);
  }

  @Post('other-income')
  @CompanyRoles(...ENTRY_ROLES)
  @ApiOperation({ summary: 'Record other (non-sales) income' })
  createOtherIncome(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOtherIncomeDto,
  ) {
    return this.expenses.createOtherIncome(companyId, user.id, dto);
  }

  @Post(':voucherId/cancel')
  @CompanyRoles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Cancel an expense / other-income entry' })
  @HttpCode(200)
  cancel(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('voucherId', ParseUUIDPipe) voucherId: string,
  ) {
    return this.expenses.cancel(companyId, voucherId);
  }
}
