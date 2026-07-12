import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { CreateRequestDto, CreateReviewDto, GrantAccessDto } from './dto/auditor.dto';

/** Client-facing marketplace — any logged-in user can browse + engage. */
@ApiTags('marketplace')
@ApiBearerAuth()
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly auditors: AuditorsService) {}

  @Get('services')
  @ApiOperation({ summary: 'Browse published services with filters' })
  browse(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('city') city?: string,
    @Query('state') state?: string,
    @Query('minExperience') minExperience?: string,
    @Query('minRating') minRating?: string,
  ) {
    return this.auditors.browse({
      q: q?.trim() || undefined,
      category: category?.trim() || undefined,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      city: city?.trim() || undefined,
      state: state?.trim() || undefined,
      minExperience: minExperience ? Number(minExperience) : undefined,
      minRating: minRating ? Number(minRating) : undefined,
    });
  }

  @Get('services/:serviceId')
  marketService(@Param('serviceId', ParseUUIDPipe) serviceId: string) {
    return this.auditors.marketService(serviceId);
  }

  @Post('services/:serviceId/requests')
  @ApiOperation({ summary: 'Enquire / request service / request custom quote' })
  createRequest(
    @CurrentUser() user: AuthUser,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Body() dto: CreateRequestDto,
  ) {
    return this.auditors.createRequest(user.id, serviceId, dto);
  }

  @Get('my/requests')
  myRequests(@CurrentUser() user: AuthUser) {
    return this.auditors.myRequests(user.id);
  }

  @Get('my/quotations')
  myQuotations(@CurrentUser() user: AuthUser) {
    return this.auditors.myQuotations(user.id);
  }

  @Post('quotations/:quotationId/accept')
  @ApiOperation({ summary: 'Accept a quotation — an invoice number is assigned' })
  accept(
    @CurrentUser() user: AuthUser,
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
  ) {
    return this.auditors.respondQuotation(user.id, quotationId, true);
  }

  @Post('quotations/:quotationId/decline')
  decline(
    @CurrentUser() user: AuthUser,
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
  ) {
    return this.auditors.respondQuotation(user.id, quotationId, false);
  }

  @Get('quotations/:quotationId/pdf')
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

  @Post('quotations/:quotationId/grant-access')
  @ApiOperation({ summary: 'Grant the quotation auditor read-only access to a company' })
  grantAccess(
    @CurrentUser() user: AuthUser,
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @Body() dto: GrantAccessDto,
  ) {
    return this.auditors.grantAccess(user.id, quotationId, dto.companyId);
  }

  @Get('auditors/:auditorId/reviews')
  listReviews(@Param('auditorId', ParseUUIDPipe) auditorId: string) {
    return this.auditors.listReviews(auditorId);
  }

  @Post('auditors/:auditorId/reviews')
  @ApiOperation({ summary: 'Review an auditor (after accepting a quotation)' })
  review(
    @CurrentUser() user: AuthUser,
    @Param('auditorId', ParseUUIDPipe) auditorId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.auditors.createReview(user.id, auditorId, dto);
  }
}
