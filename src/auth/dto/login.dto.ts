import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { AdminRole } from '../../admins/admin-role';

export class AdminLoginDto {
  @ApiProperty({ example: 'ops.admin@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail() @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'Example-Passw0rd!', format: 'password' })
  @IsString() @MinLength(1) @MaxLength(128)
  password: string;
}

export class AdminProfileDto {
  @ApiProperty({ example: '7d0c5a5e-2f7b-4c1e-9b8f-1a2b3c4d5e6f' }) id: string;
  @ApiProperty({ example: 'ops.admin@example.com' }) email: string;
  @ApiProperty({ example: 'Alex Example' }) name: string;
  @ApiProperty({ enum: AdminRole, example: AdminRole.ADMIN }) role: AdminRole;
  @ApiProperty({ example: '2026-10-17T09:00:00.000Z', nullable: true }) lastLoginAt: Date | null;
}

export class LoginResponseDto {
  @ApiProperty({ description: 'JWT access token. Also set as an HttpOnly cookie.', example: 'eyJhbGciOiJIUzI1NiIs...' })
  accessToken: string;
  @ApiProperty({ example: 'Bearer' }) tokenType: 'Bearer';
  @ApiProperty({ example: 1800, description: 'Seconds until expiry' }) expiresIn: number;
  @ApiProperty({ example: '2026-10-17T10:30:00.000Z' }) expiresAt: string;
  @ApiProperty({ type: AdminProfileDto }) admin: AdminProfileDto;
}
