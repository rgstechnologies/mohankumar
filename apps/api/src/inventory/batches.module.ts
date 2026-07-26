import {
  Controller,
  Get,
  Global,
  Module,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CompanyRoleGuard } from '../companies/guards/company-role.guard';
import { BatchesService } from './batches.service';

@ApiTags('batches')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId/items/:itemId/batches')
class BatchesController {
  constructor(private readonly batches: BatchesService) {}

  @Get()
  @ApiOperation({ summary: 'Batches of an item with stock + expiry flags' })
  list(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.batches.listItemBatches(companyId, itemId);
  }
}

@ApiTags('stock')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId')
class StockController {
  constructor(private readonly batches: BatchesService) {}

  @Get('stock')
  @ApiOperation({ summary: 'Stock on hand per item with valuation + low-stock flags' })
  stock(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.batches.stockReport(companyId);
  }
}

@Global()
@Module({
  controllers: [BatchesController, StockController],
  providers: [BatchesService],
  exports: [BatchesService],
})
export class BatchesModule {}
