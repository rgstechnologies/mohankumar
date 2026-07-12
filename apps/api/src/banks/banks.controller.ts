import {
  Body,
  Controller,
  Delete,
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
import { CompanyRoles } from '../companies/decorators/company-roles.decorator';
import { CompanyRoleGuard } from '../companies/guards/company-role.guard';
import { BanksService } from './banks.service';
import { CreateBankDto, UpdateBankDto } from './dto/bank.dto';

const EDITORS = [Role.OWNER, Role.ADMIN, Role.ACCOUNTANT] as const;

@ApiTags('banks')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId/banks')
class BanksController {
  constructor(private readonly banks: BanksService) {}

  @Get()
  @ApiOperation({ summary: 'List the company bank accounts' })
  list(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.banks.list(companyId);
  }

  @Post()
  @CompanyRoles(...EDITORS)
  @ApiOperation({ summary: 'Add a bank account (auto-creates its ledger)' })
  create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CreateBankDto,
  ) {
    return this.banks.create(companyId, dto);
  }

  @Patch(':bankId')
  @CompanyRoles(...EDITORS)
  @ApiOperation({ summary: 'Update a bank account' })
  update(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('bankId', ParseUUIDPipe) bankId: string,
    @Body() dto: UpdateBankDto,
  ) {
    return this.banks.update(companyId, bankId, dto);
  }

  @Post(':bankId/default')
  @CompanyRoles(...EDITORS)
  @ApiOperation({ summary: 'Mark a bank account as the default (printed) one' })
  setDefault(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('bankId', ParseUUIDPipe) bankId: string,
  ) {
    return this.banks.setDefault(companyId, bankId);
  }

  @Delete(':bankId')
  @CompanyRoles(...EDITORS)
  @ApiOperation({ summary: 'Remove (deactivate) a bank account' })
  remove(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('bankId', ParseUUIDPipe) bankId: string,
  ) {
    return this.banks.remove(companyId, bankId);
  }
}

@Module({
  controllers: [BanksController],
  providers: [BanksService],
})
export class BanksModule {}
