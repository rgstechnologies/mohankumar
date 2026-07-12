import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CompanyRoles } from '../companies/decorators/company-roles.decorator';
import { CompanyRoleGuard } from '../companies/guards/company-role.guard';
import { FeatureGuard, RequiresFeature } from '../licensing/feature.guard';
import { AiService } from './ai.service';
import {
  AskReportsDto,
  ParseBillDto,
  ParseVoucherDto,
  RecoSuggestDto,
} from './dto/ai.dto';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard, FeatureGuard)
@RequiresFeature('ai')
@Controller('companies/:companyId/ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('parse-voucher')
  @CompanyRoles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT, Role.CASHIER)
  @ApiOperation({
    summary: 'Draft a voucher from plain language (user reviews before posting)',
  })
  parseVoucher(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: ParseVoucherDto,
  ) {
    return this.ai.parseVoucher(companyId, dto.text, dto.audio);
  }

  // Same roles as purchase-bill creation — the draft feeds that form.
  @Post('parse-bill')
  @CompanyRoles(
    Role.OWNER,
    Role.ADMIN,
    Role.ACCOUNTANT,
    Role.CASHIER,
    Role.BRANCH_MANAGER,
  )
  @ApiOperation({
    summary: 'Read a supplier bill (photo/PDF) into a purchase draft',
  })
  parseBill(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: ParseBillDto,
  ) {
    return this.ai.parseBill(companyId, dto.fileName, dto.content);
  }

  @Post('reco-suggestions')
  @CompanyRoles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({
    summary: 'Suggest matches / missing vouchers for unmatched statement lines',
  })
  recoSuggestions(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: RecoSuggestDto,
  ) {
    return this.ai.suggestReconciliation(companyId, dto.ledgerId);
  }

  // Reports are visible to every member, so Q&A over them is too.
  @Post('ask')
  @ApiOperation({ summary: 'Ask a question about the books in plain language' })
  ask(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: AskReportsDto,
  ) {
    return this.ai.askReports(companyId, dto.question, dto.audio);
  }
}
