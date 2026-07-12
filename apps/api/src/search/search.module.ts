import {
  Controller,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CompanyRoleGuard } from '../companies/guards/company-role.guard';
import { SearchService } from './search.service';

@ApiTags('search')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId/search')
class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Universal search across parties, items, documents' })
  @ApiQuery({ name: 'q' })
  find(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query('q') q = '',
  ) {
    return this.search.search(companyId, q);
  }
}

@Module({
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
