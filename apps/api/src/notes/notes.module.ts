import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AccountingModule } from '../accounting/accounting.module';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { CompanyRoles } from '../companies/decorators/company-roles.decorator';
import { CompanyRoleGuard } from '../companies/guards/company-role.guard';
import { CreateNoteDto } from './dto/note.dto';
import { NotesService } from './notes.service';

const EDITORS = [Role.OWNER, Role.ADMIN, Role.ACCOUNTANT] as const;

@ApiTags('credit/debit notes')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId/notes')
class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Post()
  @CompanyRoles(...EDITORS)
  @ApiOperation({ summary: 'Issue a credit/debit note against an invoice/bill' })
  create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateNoteDto,
  ) {
    return this.notes.create(companyId, user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List credit/debit notes' })
  list(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.notes.list(companyId);
  }

  @Post(':noteId/cancel')
  @CompanyRoles(...EDITORS)
  @ApiOperation({ summary: 'Cancel a note (reverses its voucher)' })
  cancel(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
  ) {
    return this.notes.cancel(companyId, noteId);
  }
}

@Module({
  imports: [AccountingModule],
  controllers: [NotesController],
  providers: [NotesService],
})
export class NotesModule {}
