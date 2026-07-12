import {
  Body,
  Controller,
  Get,
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
import { JobWorkProcess, Role } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { CompanyRoles } from '../companies/decorators/company-roles.decorator';
import { CompanyRoleGuard } from '../companies/guards/company-role.guard';
import { JobWorksService } from './job-works.service';

const JOB_WORK_ROLES = [
  Role.OWNER,
  Role.ADMIN,
  Role.ACCOUNTANT,
  Role.BRANCH_MANAGER,
] as const;

class JobWorkLineDto {
  @ApiProperty()
  @IsUUID()
  itemId: string;

  @ApiProperty({ example: 500 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantity: number;
}

class CreateJobWorkDto {
  @ApiProperty({ description: 'Job worker (vendor party)' })
  @IsUUID()
  partyId: string;

  @ApiProperty({ enum: JobWorkProcess })
  @IsEnum(JobWorkProcess)
  process: JobWorkProcess;

  @ApiProperty({ example: '2026-06-12' })
  @IsDateString()
  issueDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({ type: [JobWorkLineDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => JobWorkLineDto)
  lines: JobWorkLineDto[];
}

class JobWorkReceiptDto {
  @ApiProperty({ example: '2026-06-20' })
  @IsDateString()
  date: string;

  @ApiProperty({ description: 'Finished item received (may differ from issued)' })
  @IsUUID()
  itemId: string;

  @ApiProperty({ example: 480 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantity: number;

  @ApiPropertyOptional({ default: 0, description: 'Process wastage — lost, not restocked' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  wastageQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

@ApiTags('job-work')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId/job-works')
export class JobWorksController {
  constructor(private readonly jobWorks: JobWorksService) {}

  @Get()
  @ApiOperation({ summary: 'Job works with issue/receipt/pending totals' })
  list(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.jobWorks.list(companyId);
  }

  @Get(':jobWorkId')
  @ApiOperation({ summary: 'One job work in full' })
  getOne(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('jobWorkId', ParseUUIDPipe) jobWorkId: string,
  ) {
    return this.jobWorks.getOne(companyId, jobWorkId);
  }

  @Post()
  @CompanyRoles(...JOB_WORK_ROLES)
  @ApiOperation({ summary: 'Send material to a job worker (stock leaves on-hand)' })
  create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateJobWorkDto,
  ) {
    return this.jobWorks.create(companyId, user.id, dto);
  }

  @Post(':jobWorkId/receipts')
  @CompanyRoles(...JOB_WORK_ROLES)
  @ApiOperation({ summary: 'Receive finished goods back (wastage recorded)' })
  receive(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('jobWorkId', ParseUUIDPipe) jobWorkId: string,
    @Body() dto: JobWorkReceiptDto,
  ) {
    return this.jobWorks.addReceipt(companyId, jobWorkId, dto);
  }

  @Post(':jobWorkId/close')
  @CompanyRoles(...JOB_WORK_ROLES)
  @ApiOperation({ summary: 'Close — leftover issued material counts as consumed' })
  close(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('jobWorkId', ParseUUIDPipe) jobWorkId: string,
  ) {
    return this.jobWorks.close(companyId, jobWorkId);
  }

  @Post(':jobWorkId/cancel')
  @CompanyRoles(...JOB_WORK_ROLES)
  @ApiOperation({ summary: 'Cancel (only before any receipt) — restores stock' })
  cancel(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('jobWorkId', ParseUUIDPipe) jobWorkId: string,
  ) {
    return this.jobWorks.cancel(companyId, jobWorkId);
  }
}
