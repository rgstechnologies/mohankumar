import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { OpeningDocKind, Role } from '@prisma/client';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
} from 'class-validator';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { CompanyRoles } from '../companies/decorators/company-roles.decorator';
import { CompanyRoleGuard } from '../companies/guards/company-role.guard';
import { OpeningDocsService } from './opening-docs.service';

class SettleDto {
  @ApiProperty({ example: 5000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiProperty({ description: 'Cash or bank ledger receiving/paying the money' })
  @IsUUID()
  ledgerId: string;

  @ApiPropertyOptional({ example: '2026-06-12' })
  @IsOptional()
  @IsDateString()
  date?: string;
}

@ApiTags('opening-documents')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId/opening-docs')
export class OpeningDocsController {
  constructor(private readonly openingDocs: OpeningDocsService) {}

  @Get()
  @ApiOperation({ summary: 'Bill-wise opening balances carried over on migration' })
  @ApiQuery({ name: 'kind', required: false, enum: OpeningDocKind })
  list(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query('kind') kind?: OpeningDocKind,
  ) {
    return this.openingDocs.list(
      companyId,
      kind && Object.values(OpeningDocKind).includes(kind) ? kind : undefined,
    );
  }

  @Post(':docId/settle')
  @CompanyRoles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT, Role.CASHIER)
  @ApiOperation({ summary: 'Record money received/paid against an opening document' })
  settle(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('docId', ParseUUIDPipe) docId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SettleDto,
  ) {
    return this.openingDocs.settle(
      companyId,
      user.id,
      docId,
      dto.amount,
      dto.ledgerId,
      dto.date,
    );
  }
}
