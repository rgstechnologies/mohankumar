import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';
import { Public } from '../auth/decorators/public.decorator';
import { CompaniesService } from './companies.service';

class AcceptInviteDto {
  @ApiPropertyOptional({ description: 'Required when the invited email has no account yet' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ minLength: 8 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;
}

@ApiTags('invites')
@Controller('invites')
export class InvitesController {
  constructor(
    private readonly companies: CompaniesService,
    private readonly auth: AuthService,
  ) {}

  @Public()
  @Get(':token')
  @ApiOperation({ summary: 'Preview an invite (public, by token)' })
  preview(@Param('token') token: string) {
    return this.companies.previewInvite(token);
  }

  @Public()
  @Post(':token/accept')
  @ApiOperation({ summary: 'Accept an invite; creates the account if needed' })
  async accept(@Param('token') token: string, @Body() dto: AcceptInviteDto) {
    const newUser =
      dto.name && dto.password
        ? {
            name: dto.name,
            passwordHash: await this.auth.hashPassword(dto.password),
          }
        : undefined;
    return this.companies.acceptInvite(token, newUser);
  }
}
