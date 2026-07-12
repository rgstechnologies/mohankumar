import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AdjustLoyaltyDto {
  @ApiProperty()
  @IsUUID()
  partyId: string;

  @ApiProperty({ example: -100, description: 'Signed points: negative to redeem, positive to gift' })
  @IsInt()
  points: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
