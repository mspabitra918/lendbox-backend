import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import * as bcrypt from 'bcrypt';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';
import { AdminRole } from './admin-role';
import { Admin } from './models/admin.model';

export const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,128}$/;
export const PASSWORD_POLICY_MESSAGE = 'Password must be 12-128 characters and include upper and lower case letters, a digit and a symbol.';

export interface PublicAdmin {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class AdminsService {
  constructor(
    @InjectModel(Admin) private readonly admins: typeof Admin,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  findByEmail(email: string) {
    return this.admins.findOne({ where: { email: email.trim().toLowerCase() } });
  }

  findById(id: string) {
    return this.admins.findByPk(id);
  }

  async create(input: { email: string; name: string; password: string; role?: AdminRole }): Promise<PublicAdmin> {
    const email = input.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Invalid email address.');
    if (!input.name.trim()) throw new BadRequestException('Name is required.');
    if (!PASSWORD_POLICY.test(input.password)) throw new BadRequestException(PASSWORD_POLICY_MESSAGE);
    if (await this.findByEmail(email)) throw new ConflictException('An admin with this email already exists.');

    const passwordHash = await bcrypt.hash(input.password, this.config.auth.bcryptRounds);
    const admin = await this.admins.create({
      email,
      name: input.name.trim().slice(0, 120),
      passwordHash,
      role: input.role ?? AdminRole.ADMIN,
      isActive: true,
    });
    return AdminsService.toPublic(admin);
  }

  static toPublic(admin: Admin): PublicAdmin {
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      isActive: admin.isActive,
      lastLoginAt: admin.lastLoginAt,
      createdAt: admin.createdAt,
    };
  }
}
