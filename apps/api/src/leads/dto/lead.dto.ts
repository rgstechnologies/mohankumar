import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateLeadDto {
  @ApiProperty({ example: 'Naveen Krishna' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'Acme Textiles Pvt Ltd' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  companyName: string;

  @ApiProperty({ example: 'owner@acme.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+919876543210' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[0-9][0-9\s\-()]{6,18}$/, {
    message: 'Enter a valid phone number',
  })
  phone: string;

  @ApiPropertyOptional({ example: 'We run 4 branches and need open API access.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  requirements?: string;

  @ApiPropertyOptional({ enum: ['ENTERPRISE', 'BUSINESS'], default: 'ENTERPRISE' })
  @IsOptional()
  @IsIn(['ENTERPRISE', 'BUSINESS'])
  plan?: 'ENTERPRISE' | 'BUSINESS';
}

export class UpdateLeadStatusDto {
  @ApiProperty({ enum: ['NEW', 'CONTACTED', 'CLOSED'] })
  @IsIn(['NEW', 'CONTACTED', 'CLOSED'])
  status: 'NEW' | 'CONTACTED' | 'CLOSED';
}
