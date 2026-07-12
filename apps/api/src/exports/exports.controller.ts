import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CompanyRoleGuard } from '../companies/guards/company-role.guard';
import { ExporterService } from './exporter.service';
import {
  EXPORTABLE_REPORTS,
  ExportsService,
  type ExportableReport,
} from './exports.service';
import { Gstr1JsonService } from './gstr1-json.service';

const FORMATS = {
  csv: { contentType: 'text/csv; charset=utf-8', extension: 'csv' },
  xlsx: {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx',
  },
  pdf: { contentType: 'application/pdf', extension: 'pdf' },
} as const;

type Format = keyof typeof FORMATS;

@ApiTags('exports')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId/exports')
export class ExportsController {
  constructor(
    private readonly exports: ExportsService,
    private readonly exporter: ExporterService,
    private readonly gstr1Json: Gstr1JsonService,
  ) {}

  // Declared before :report so the literal path wins the route match.
  @Get('gstr1-json')
  @ApiOperation({
    summary: 'GSTR-1 in the GST portal offline-tool JSON format (one month)',
  })
  @ApiQuery({ name: 'month', example: '2026-06', description: 'YYYY-MM' })
  async gstr1PortalJson(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query('month') month: string,
    @Res() res: Response,
  ): Promise<void> {
    const { fileName, json } = await this.gstr1Json.build(companyId, month ?? '');
    const buffer = Buffer.from(JSON.stringify(json), 'utf8');
    res
      .status(200)
      .set({
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="bookly-${fileName}.json"`,
        'Content-Length': buffer.length,
      })
      .end(buffer);
  }

  @Get(':report')
  @ApiOperation({ summary: 'Export a report/register as CSV, XLSX or PDF' })
  @ApiParam({ name: 'report', enum: EXPORTABLE_REPORTS })
  @ApiQuery({ name: 'format', enum: Object.keys(FORMATS), required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'asOf', required: false })
  @ApiQuery({ name: 'ledgerId', required: false })
  async export(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('report') report: string,
    @Res() res: Response,
    @Query('format') format = 'csv',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('asOf') asOf?: string,
    @Query('ledgerId') ledgerId?: string,
  ): Promise<void> {
    if (!EXPORTABLE_REPORTS.includes(report as ExportableReport)) {
      throw new BadRequestException(
        `Unknown report "${report}". Available: ${EXPORTABLE_REPORTS.join(', ')}`,
      );
    }
    if (!(format in FORMATS)) {
      throw new BadRequestException('format must be one of: csv, xlsx, pdf');
    }

    const doc = await this.exports.buildDoc(companyId, report as ExportableReport, {
      from,
      to,
      asOf,
      ledgerId,
    });

    const buffer =
      format === 'csv'
        ? this.exporter.toCsv(doc)
        : format === 'xlsx'
          ? await this.exporter.toXlsx(doc)
          : await this.exporter.toPdf(doc);

    const { contentType, extension } = FORMATS[format as Format];
    res
      .status(200)
      .set({
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="bookly-${doc.fileName}.${extension}"`,
        'Content-Length': buffer.length,
      })
      .end(buffer);
  }
}
