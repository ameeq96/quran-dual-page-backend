import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MemoryCacheService } from '../common/cache/memory-cache.service';
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
    private readonly cache: MemoryCacheService,
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

  async upsertSetting(payload: Partial<AppSetting>) {
    const saved = await this.settingsRepo.save(payload);
    this._invalidateCaches();
    return saved;
  }

  getSettingByKey(key: string) {
    return this.settingsRepo.findOne({
      where: { key: key.trim() },
    });
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
    const flag = await this.flagsRepo.findOne({ where: { id } });
    this._invalidateCaches();
    return flag;
  }

  private _invalidateCaches() {
    this.cache.deleteByPrefix('public-config:');
    this.cache.deleteByPrefix('public-ai:');
    this.cache.deleteByPrefix('admin:');
  }
}
