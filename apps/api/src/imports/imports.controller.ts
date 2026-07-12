import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { PartyType, Role } from '@prisma/client';
import {
  IsArray,
  IsBase64,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CompanyRoles } from '../companies/decorators/company-roles.decorator';
import { CompanyRoleGuard } from '../companies/guards/company-role.guard';
import { ImportsService } from './imports.service';
import type { ColumnMapping, ImportEntity } from './import-rows';

const IMPORT_ENTITIES = [
  'LEDGERS',
  'PARTIES',
  'ITEMS',
  'OPEN_INVOICES',
  'OPEN_BILLS',
] as const;

class InspectDto {
  @ApiProperty({ example: 'tally-masters.xml' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fileName: string;

  @ApiProperty({ description: 'File content, base64-encoded' })
  @IsBase64()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({ enum: IMPORT_ENTITIES })
  @IsOptional()
  @IsIn(IMPORT_ENTITIES)
  entity?: ImportEntity;
}

class PreviewDto {
  @ApiProperty({ example: 'parties.csv' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fileName: string;

  @ApiProperty({ description: 'File content, base64-encoded' })
  @IsBase64()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ enum: IMPORT_ENTITIES })
  @IsIn(IMPORT_ENTITIES)
  entity: ImportEntity;

  @ApiProperty({ description: 'field → zero-based column index' })
  @IsObject()
  mapping: ColumnMapping;

  @ApiPropertyOptional({ enum: PartyType })
  @IsOptional()
  @IsEnum(PartyType)
  defaultPartyType?: PartyType;
}

class CommitDto {
  @ApiProperty({ enum: IMPORT_ENTITIES })
  @IsIn(IMPORT_ENTITIES)
  entity: ImportEntity;

  @ApiProperty({ description: 'Rows exactly as returned by inspect/preview' })
  @IsArray()
  rows: Record<string, string | number | undefined>[];
}

@ApiTags('imports')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@CompanyRoles(Role.OWNER, Role.ADMIN)
@Controller('companies/:companyId/imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post('inspect')
  @ApiOperation({
    summary: 'Detect format and preview a Tally XML / CSV / XLSX file',
  })
  inspect(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: InspectDto,
  ) {
    return this.imports.inspect(companyId, dto.fileName, dto.content, dto.entity);
  }

  @Post('preview')
  @ApiOperation({
    summary: 'Validate a CSV/XLSX with a column mapping (dry run)',
  })
  preview(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: PreviewDto,
  ) {
    return this.imports.previewTable(
      companyId,
      dto.fileName,
      dto.content,
      dto.entity,
      dto.mapping,
      dto.defaultPartyType,
    );
  }

  @Post('commit')
  @ApiOperation({ summary: 'Create the previewed rows' })
  commit(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CommitDto,
  ) {
    return this.imports.commit(companyId, dto.entity, dto.rows);
  }
}
