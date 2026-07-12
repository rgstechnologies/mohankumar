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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PartyType, Role } from '@prisma/client';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { CompanyRoles } from '../companies/decorators/company-roles.decorator';
import { CompanyRoleGuard } from '../companies/guards/company-role.guard';
import {
  CreateItemDto,
  CreatePartyDto,
  RecordPartyPaymentDto,
  UpdateItemDto,
  UpdatePartyDto,
} from './dto/party.dto';
import { PartiesService } from './parties.service';

const EDITORS = [Role.OWNER, Role.ADMIN, Role.ACCOUNTANT] as const;

@ApiTags('parties & items')
@ApiBearerAuth()
@UseGuards(CompanyRoleGuard)
@Controller('companies/:companyId')
export class PartiesController {
  constructor(private readonly parties: PartiesService) {}

  @Post('parties')
  @CompanyRoles(...EDITORS)
  @ApiOperation({ summary: 'Create a customer/vendor (auto-creates its ledger)' })
  createParty(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CreatePartyDto,
  ) {
    return this.parties.createParty(companyId, dto);
  }

  @Get('parties')
  @ApiOperation({ summary: 'List parties with receivable/payable balances' })
  @ApiQuery({ name: 'type', enum: PartyType, required: false })
  listParties(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query('type') type?: PartyType,
  ) {
    return this.parties.listParties(companyId, type);
  }

  @Get('parties/:partyId')
  @ApiOperation({ summary: 'Party detail' })
  getParty(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('partyId', ParseUUIDPipe) partyId: string,
  ) {
    return this.parties.getParty(companyId, partyId);
  }

  @Get('parties/:partyId/statement')
  @ApiOperation({
    summary:
      "Document-based statement for a party — its tracked doc type's documents " +
      '(paid + unpaid) with per-document outstanding. Strict estimate/invoice separation.',
  })
  partyStatement(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('partyId', ParseUUIDPipe) partyId: string,
  ) {
    return this.parties.partyStatement(companyId, partyId);
  }

  @Patch('parties/:partyId')
  @CompanyRoles(...EDITORS)
  @ApiOperation({ summary: 'Update a party (renames its ledger atomically)' })
  updateParty(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('partyId', ParseUUIDPipe) partyId: string,
    @Body() dto: UpdatePartyDto,
  ) {
    return this.parties.updateParty(companyId, partyId, dto);
  }

  @Post('parties/:partyId/payments')
  @CompanyRoles(...EDITORS)
  @ApiOperation({
    summary:
      'Record a receipt/payment against a party (cuts pending balance; optional advance link)',
  })
  recordPartyPayment(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('partyId', ParseUUIDPipe) partyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RecordPartyPaymentDto,
  ) {
    return this.parties.recordPartyPayment(companyId, partyId, user.id, dto);
  }

  @Get('parties/:partyId/payments')
  @ApiOperation({ summary: 'List standalone receipts/payments for a party' })
  listPartyPayments(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('partyId', ParseUUIDPipe) partyId: string,
  ) {
    return this.parties.listPartyPayments(companyId, partyId);
  }

  @Delete('parties/:partyId/payments/:paymentId')
  @CompanyRoles(...EDITORS)
  @ApiOperation({
    summary: 'Delete a receipt/payment entry (reverses its ledger effect)',
  })
  deletePartyPayment(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('partyId', ParseUUIDPipe) partyId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return this.parties.deletePartyPayment(companyId, partyId, paymentId);
  }

  @Post('items')
  @CompanyRoles(...EDITORS)
  @ApiOperation({ summary: 'Create an item (HSN, unit, GST rate, prices)' })
  createItem(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CreateItemDto,
  ) {
    return this.parties.createItem(companyId, dto);
  }

  @Get('items')
  @ApiOperation({ summary: 'List items' })
  listItems(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.parties.listItems(companyId);
  }

  @Patch('items/:itemId')
  @CompanyRoles(...EDITORS)
  @ApiOperation({ summary: 'Update an item' })
  updateItem(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateItemDto,
  ) {
    return this.parties.updateItem(companyId, itemId, dto);
  }
}
