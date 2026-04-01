import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { GoogleAccount } from './account.entity';
import { encrypt, decrypt } from '../config/encryption';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(GoogleAccount)
    private readonly repo: Repository<GoogleAccount>,
    private readonly configService: ConfigService,
  ) {}

  async findAll(): Promise<GoogleAccount[]> {
    return this.repo.find({ order: { created_at: 'ASC' } });
  }

  async findActive(): Promise<GoogleAccount[]> {
    return this.repo.find({
      where: { is_active: true },
      order: { created_at: 'ASC' },
    });
  }

  async findByEmail(email: string): Promise<GoogleAccount | null> {
    return this.repo.findOne({ where: { email } });
  }

  async findById(id: string): Promise<GoogleAccount | null> {
    return this.repo.findOne({ where: { id } });
  }

  async upsertAccount(data: {
    email: string;
    label: string;
    accessToken: string;
    refreshToken: string;
    expiryDate: number;
  }): Promise<GoogleAccount> {
    let account = await this.findByEmail(data.email);

    const encAccessToken = encrypt(data.accessToken, this.configService);
    const encRefreshToken = encrypt(data.refreshToken, this.configService);

    if (account) {
      account.access_token = encAccessToken;
      account.refresh_token = encRefreshToken;
      account.token_expiry = new Date(data.expiryDate);
      account.is_active = true;
      return this.repo.save(account);
    }

    account = this.repo.create({
      email: data.email,
      label: data.label,
      access_token: encAccessToken,
      refresh_token: encRefreshToken,
      token_expiry: new Date(data.expiryDate),
      is_active: true,
    });
    return this.repo.save(account);
  }

  async updateTokens(
    id: string,
    accessToken: string,
    expiryDate: number,
  ): Promise<void> {
    await this.repo.update(id, {
      access_token: encrypt(accessToken, this.configService),
      token_expiry: new Date(expiryDate),
    });
  }

  async remove(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  decryptAccessToken(account: GoogleAccount): string {
    return decrypt(account.access_token, this.configService);
  }

  decryptRefreshToken(account: GoogleAccount): string {
    return decrypt(account.refresh_token, this.configService);
  }
}
