import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ContactQueryDto {
  @ApiPropertyOptional({ example: 'Help with GST report' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  subject?: string;

  @ApiProperty({ example: 'I need help reconciling my GSTR-1 for last month.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message: string;
}
