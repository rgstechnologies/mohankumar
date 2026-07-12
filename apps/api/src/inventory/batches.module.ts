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
import { JobWorksController } from './job-works.controller';
import { JobWorksService } from './job-works.service';
import { StockTransfersController } from './stock-transfers.controller';
import { StockTransfersService } from './stock-transfers.service';

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

@Global()
@Module({
  controllers: [BatchesController, StockTransfersController, JobWorksController],
  providers: [BatchesService, StockTransfersService, JobWorksService],
  exports: [BatchesService, StockTransfersService, JobWorksService],
})
export class BatchesModule {}
