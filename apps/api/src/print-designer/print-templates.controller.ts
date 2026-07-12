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
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Request, Response } from 'express';
import type { PrintDesign } from '@bookly/shared';
import { CompanyRoles } from '../companies/decorators/company-roles.decorator';
import { CompanyRoleGuard } from '../companies/guards/company-role.guard';
import { InvoicesService } from '../invoices/invoices.service';
import { DesignPdfService } from './design-pdf.service';
import {
  CreatePrintTemplateDto,
  PreviewDesignDto,
  UpdatePrintTemplateDto,
} from './dto/print-template.dto';
import { PrintTemplatesService } from './print-templates.service';

@ApiTags('print-designer')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId/print-templates')
export class PrintTemplatesController {
  constructor(
    private readonly templates: PrintTemplatesService,
    private readonly invoices: InvoicesService,
    private readonly designPdf: DesignPdfService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List saved custom print designs' })
  list(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query('docKind') docKind?: string,
  ) {
    return this.templates.list(companyId, docKind ?? 'invoice');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one custom print design (with its full layout)' })
  get(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.templates.get(companyId, id);
  }

  @Post()
  @CompanyRoles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Save a new custom print design' })
  create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CreatePrintTemplateDto,
  ) {
    return this.templates.create(companyId, dto);
  }

  @Patch(':id')
  @CompanyRoles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Update a custom print design' })
  update(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePrintTemplateDto,
  ) {
    return this.templates.update(companyId, id, dto);
  }

  @Delete(':id')
  @CompanyRoles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Delete a custom print design' })
  remove(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.templates.remove(companyId, id);
  }

  @Post(':id/duplicate')
  @CompanyRoles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Duplicate a custom print design' })
  duplicate(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.templates.duplicate(companyId, id);
  }

  @Post(':id/default')
  @CompanyRoles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Set a design as the default for its document type' })
  setDefault(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.templates.setDefault(companyId, id);
  }

  @Post('preview')
  @CompanyRoles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Render a design with sample data to a live PDF preview' })
  async preview(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: PreviewDesignDto,
    @Res() res: Response,
    @Req() req: Request,
  ): Promise<void> {
    const invoice = await this.invoices.buildTemplatePreview(companyId, {});
    const locale = (req.cookies as Record<string, string> | undefined)?.['sa.locale'];
    const buffer = await this.designPdf.render(
      invoice,
      dto.design as unknown as PrintDesign,
      locale,
      dto.docKind ?? 'invoice',
    );
    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="design-preview.pdf"',
        'Content-Length': buffer.length,
      })
      .end(buffer);
  }
}
