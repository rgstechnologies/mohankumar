import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Public } from '../auth/decorators/public.decorator';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { BillingService } from './billing.service';

class CreateOrderDto {
  @ApiProperty({ example: 'BUSINESS' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  planCode: string;

  @ApiProperty({ example: 12, enum: [1, 3, 6, 12] })
  @IsInt()
  @IsIn([1, 3, 6, 12])
  months: number;

  @ApiProperty({ required: false, example: 'WELCOME20' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  referralCode?: string;
}

class VerifyDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  razorpayOrderId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  razorpayPaymentId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  razorpaySignature: string;
}

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('plans')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Plans purchasable online' })
  plans() {
    return this.billing.purchasablePlans();
  }

  @Post('orders')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a Razorpay order for a plan purchase' })
  createOrder(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.billing.createOrder(user.id, dto.planCode, dto.months, dto.referralCode);
  }

  @Post('referral/preview')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Validate a referral code and preview the discount' })
  previewReferral(@Body() dto: CreateOrderDto) {
    if (!dto.referralCode) throw new BadRequestException('referralCode is required');
    return this.billing.previewReferral(dto.referralCode, dto.planCode, dto.months);
  }

  @Post('verify')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Verify a checkout payment and activate the subscription',
  })
  verify(@CurrentUser() user: AuthUser, @Body() dto: VerifyDto) {
    return this.billing.verifyAndActivate(
      user.id,
      dto.razorpayOrderId,
      dto.razorpayPaymentId,
      dto.razorpaySignature,
    );
  }

  // Razorpay calls this server-to-server; auth is the HMAC signature.
  @Public()
  @Post('webhook')
  @ApiOperation({ summary: 'Razorpay webhook (payment.captured)' })
  webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-razorpay-signature') signature?: string,
  ) {
    if (!req.rawBody) throw new BadRequestException('Missing request body');
    return this.billing.handleWebhook(req.rawBody, signature ?? '');
  }
}
