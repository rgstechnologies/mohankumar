import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SalesLeadStatus } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { SuperAdminGuard } from '../admin/super-admin.guard';
import { CreateLeadDto, UpdateLeadStatusDto } from './dto/lead.dto';
import { LeadsService } from './leads.service';

@ApiTags('leads')
@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  // Public: enterprise "Contact sales" enquiry from the pricing page.
  @Public()
  @Post()
  @ApiOperation({ summary: 'Submit a sales enquiry (public)' })
  create(@Body() dto: CreateLeadDto) {
    return this.leads.create(dto);
  }

  // Platform staff only.
  @Get()
  @ApiBearerAuth()
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'List sales enquiries' })
  list(@Query('status') status?: string) {
    const valid =
      status && (Object.values(SalesLeadStatus) as string[]).includes(status)
        ? (status as SalesLeadStatus)
        : undefined;
    return this.leads.list(valid);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Update a sales enquiry status' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadStatusDto,
  ) {
    return this.leads.updateStatus(id, dto);
  }
}
