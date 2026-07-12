import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { ContactQueryDto } from './dto/support.dto';
import { SupportService } from './support.service';

@ApiTags('support')
@ApiBearerAuth()
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post('contact')
  @ApiOperation({ summary: 'Send a contact/support query to the admin inbox' })
  contact(@CurrentUser() user: AuthUser, @Body() dto: ContactQueryDto) {
    return this.support.contact(user, dto);
  }
}
