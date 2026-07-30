import { Transform } from "class-transformer";
import { IsDateString, IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from "class-validator";

export class RegisterDto {
  @IsString()
  @Length(2, 80)
  firstName!: string;

  @IsString()
  @Length(2, 80)
  lastName!: string;

  @Transform(({ value }: { value: unknown }) => String(value).trim())
  @IsString()
  @Matches(/^[A-Za-z0-9_]{3,24}$/, {
    message: "Username must be 3-24 characters using letters, numbers, or underscores.",
  })
  username!: string;

  @Transform(({ value }: { value: unknown }) => String(value).trim().toLowerCase())
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Length(10, 128)
  password!: string;

  @IsIn(["Man", "Woman", "Nonbinary"])
  identity!: string;

  @IsIn(["Women", "Men", "Everyone"])
  seeking!: string;

  @IsDateString({ strict: true })
  dateOfBirth!: string;
}

export class LoginDto {
  @Transform(({ value }: { value: unknown }) => String(value).trim().toLowerCase())
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Length(1, 128)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  deviceName?: string;
}

export class RefreshDto {
  @IsString()
  @Length(32, 512)
  refreshToken!: string;
}

export class ResendVerificationDto {
  @Transform(({ value }: { value: unknown }) => String(value).trim().toLowerCase())
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class CompleteEmailLoginDto {
  @IsString()
  @Length(32, 512)
  ticket!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  deviceName?: string;
}

export class UpdateUsernameDto {
  @Transform(({ value }: { value: unknown }) => String(value).trim())
  @IsString()
  @Matches(/^[A-Za-z0-9_]{3,24}$/, {
    message: "Username must be 3-24 characters using letters, numbers, or underscores.",
  })
  username!: string;
}

export class ForgotPasswordDto {
  @Transform(({ value }: { value: unknown }) => String(value).trim().toLowerCase())
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @Length(32, 512)
  token!: string;

  @IsString()
  @Length(10, 128)
  password!: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  currentPassword?: string;
}
