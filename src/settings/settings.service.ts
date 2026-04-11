import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSetting } from '../entities/app_setting.entity';
import { FeatureFlag } from '../entities/feature_flag.entity';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../common/pagination/pagination';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(AppSetting)
    private readonly settingsRepo: Repository<AppSetting>,
    @InjectRepository(FeatureFlag)
    private readonly flagsRepo: Repository<FeatureFlag>,
  ) {}

  async getSettings(rawPage?: number | string, rawPageSize?: number | string) {
    const { page, pageSize, skip, take } = normalizePagination(
      rawPage,
      rawPageSize,
    );
    const [items, totalItems] = await this.settingsRepo.findAndCount({
      order: { key: 'ASC' },
      skip,
      take,
    });
    return buildPaginatedResponse(items, totalItems, page, pageSize);
  }

  upsertSetting(payload: Partial<AppSetting>) {
    return this.settingsRepo.save(payload);
  }

  async getFlags(rawPage?: number | string, rawPageSize?: number | string) {
    const { page, pageSize, skip, take } = normalizePagination(
      rawPage,
      rawPageSize,
    );
    const [items, totalItems] = await this.flagsRepo.findAndCount({
      order: { key: 'ASC' },
      skip,
      take,
    });
    return buildPaginatedResponse(items, totalItems, page, pageSize);
  }

  async toggleFlag(id: number, enabled: boolean) {
    await this.flagsRepo.update({ id }, { enabled });
    return this.flagsRepo.findOne({ where: { id } });
  }
}
