import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { AuditorsService } from './auditors.service';
import {
  CreateAuditorDto,
  CreateQuotationDto,
  CreateServiceDto,
  CreateTierDto,
  UpdateAuditorDto,
  UpdateRequestStatusDto,
  UpdateServiceDto,
  UpdateTierDto,
} from './dto/auditor.dto';

@ApiTags('auditors')
@ApiBearerAuth()
@Controller('auditors')
export class AuditorsController {
  constructor(private readonly auditors: AuditorsService) {}

  // ---- Profile ----

  @Get('me')
  @ApiOperation({ summary: 'My auditor profile (null if not set up yet)' })
  getMine(@CurrentUser() user: AuthUser) {
    return this.auditors.getMine(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create my auditor profile (become an auditor)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAuditorDto) {
    return this.auditors.createProfile(user.id, dto);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update my auditor profile' })
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateAuditorDto) {
    return this.auditors.updateProfile(user.id, dto);
  }

  // ---- Services ----

  @Get('me/services')
  @ApiOperation({ summary: 'My services with pricing tiers + features' })
  listServices(@CurrentUser() user: AuthUser) {
    return this.auditors.listServices(user.id);
  }

  @Post('me/services')
  createService(@CurrentUser() user: AuthUser, @Body() dto: CreateServiceDto) {
    return this.auditors.createService(user.id, dto);
  }

  @Patch('me/services/:serviceId')
  updateService(
    @CurrentUser() user: AuthUser,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.auditors.updateService(user.id, serviceId, dto);
  }

  @Delete('me/services/:serviceId')
  deleteService(
    @CurrentUser() user: AuthUser,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
  ) {
    return this.auditors.deleteService(user.id, serviceId);
  }

  // ---- Pricing tiers ----

  @Post('me/services/:serviceId/tiers')
  createTier(
    @CurrentUser() user: AuthUser,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Body() dto: CreateTierDto,
  ) {
    return this.auditors.createTier(user.id, serviceId, dto);
  }

  @Patch('me/services/:serviceId/tiers/:tierId')
  updateTier(
    @CurrentUser() user: AuthUser,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Param('tierId', ParseUUIDPipe) tierId: string,
    @Body() dto: UpdateTierDto,
  ) {
    return this.auditors.updateTier(user.id, serviceId, tierId, dto);
  }

  @Delete('me/services/:serviceId/tiers/:tierId')
  deleteTier(
    @CurrentUser() user: AuthUser,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Param('tierId', ParseUUIDPipe) tierId: string,
  ) {
    return this.auditors.deleteTier(user.id, serviceId, tierId);
  }

  // ---- Inbox: client requests + sending quotations ----

  @Get('me/requests')
  @ApiOperation({ summary: 'Client requests/enquiries sent to me' })
  listRequests(@CurrentUser() user: AuthUser) {
    return this.auditors.listRequests(user.id);
  }

  @Patch('me/requests/:requestId')
  setRequestStatus(
    @CurrentUser() user: AuthUser,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: UpdateRequestStatusDto,
  ) {
    return this.auditors.setRequestStatus(user.id, requestId, dto.status);
  }

  @Post('me/requests/:requestId/quotations')
  @ApiOperation({ summary: 'Send a custom quotation for a request' })
  createQuotation(
    @CurrentUser() user: AuthUser,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: CreateQuotationDto,
  ) {
    return this.auditors.createQuotation(user.id, requestId, dto);
  }

  @Get('me/quotations')
  @ApiOperation({ summary: 'Quotations I have sent' })
  listQuotations(@CurrentUser() user: AuthUser) {
    return this.auditors.listQuotations(user.id);
  }

  @Get('me/analytics')
  @ApiOperation({ summary: 'My service analytics (KPIs)' })
  analytics(@CurrentUser() user: AuthUser) {
    return this.auditors.analytics(user.id);
  }

  @Get('me/clients')
  @ApiOperation({ summary: 'Companies that granted me read-only access' })
  myClients(@CurrentUser() user: AuthUser) {
    return this.auditors.myClients(user.id);
  }

  @Get('me/quotations/:quotationId/pdf')
  @ApiOperation({ summary: 'Download a quotation/invoice PDF' })
  async quotationPdf(
    @CurrentUser() user: AuthUser,
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @Res() res: Response,
    @Query('lang') lang?: string,
  ): Promise<void> {
    const { buffer, fileName } = await this.auditors.quotationPdf(quotationId, user.id, lang);
    res.status(200).set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': buffer.length,
    }).end(buffer);
  }
}
