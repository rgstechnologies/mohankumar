import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { CompaniesService } from './companies.service';
import { CompanyRoles } from './decorators/company-roles.decorator';
import {
  UpdateCompanyDto,
  InvoiceTemplateDto,
} from './dto/company.dto';
import { CompanyRoleGuard } from './guards/company-role.guard';

@ApiTags('companies')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  // No POST /companies: this install serves exactly one business, provisioned
  // by `npm run db:seed`. An open create-company route would let any signed-in
  // user spin up books beside the client's.

  @Get()
  @ApiOperation({ summary: 'List companies I belong to' })
  listMine(@CurrentUser() user: AuthUser) {
    return this.companies.listMine(user.id);
  }

  @Get(':companyId')
  @UseGuards(CompanyRoleGuard)
  @ApiOperation({ summary: 'Company details + members (members only)' })
  getOne(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.companies.getOne(companyId);
  }

  @Patch(':companyId')
  @UseGuards(CompanyRoleGuard)
  @CompanyRoles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Update the company profile (OWNER/ADMIN only)' })
  update(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.companies.update(companyId, dto);
  }

  @Patch(':companyId/document-templates/:docKind')
  @UseGuards(CompanyRoleGuard)
  @CompanyRoles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Save the print layout for one document type' })
  setDocumentTemplate(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('docKind') docKind: string,
    @Body() dto: InvoiceTemplateDto,
  ) {
    return this.companies.setDocumentTemplate(companyId, docKind, dto);
  }

}
