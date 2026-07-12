import {
  Body,
  Controller,
  Delete,
  Get,
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
import { CompaniesService } from './companies.service';
import { CompanyRoles } from './decorators/company-roles.decorator';
import {
  CreateCompanyDto,
  UpdateCompanyDto,
  CreateInviteDto,
  InvoiceTemplateDto,
} from './dto/company.dto';
import { CompanyRoleGuard } from './guards/company-role.guard';

@ApiTags('companies')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a company (creator becomes OWNER)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCompanyDto) {
    return this.companies.create(user.id, dto);
  }

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

  @Get(':companyId/auditor-access')
  @UseGuards(CompanyRoleGuard)
  @CompanyRoles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Auditors granted read-only access to this company' })
  listGrantedAuditors(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.companies.listGrantedAuditors(companyId);
  }

  @Delete(':companyId/auditor-access/:auditorUserId')
  @UseGuards(CompanyRoleGuard)
  @CompanyRoles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Revoke an auditor’s access' })
  revokeAuditorAccess(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('auditorUserId', ParseUUIDPipe) auditorUserId: string,
  ) {
    return this.companies.revokeAuditorAccess(companyId, auditorUserId);
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

  @Post(':companyId/invites')
  @UseGuards(CompanyRoleGuard)
  @CompanyRoles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Invite a user by email (OWNER/ADMIN only)' })
  invite(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateInviteDto,
  ) {
    return this.companies.invite(companyId, user.id, dto);
  }

  @Get(':companyId/invites')
  @UseGuards(CompanyRoleGuard)
  @CompanyRoles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'List pending invites (OWNER/ADMIN only)' })
  listInvites(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.companies.listInvites(companyId);
  }

  @Get(':companyId/gstin/:gstin')
  @UseGuards(CompanyRoleGuard)
  @ApiOperation({
    summary: 'Verify a GSTIN via the government portal (Sandbox.co.in)',
  })
  resolveGstin(@Param('gstin') gstin: string) {
    return this.companies.resolveGstin(gstin);
  }
}
