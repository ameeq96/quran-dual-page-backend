import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MemoryCacheService } from '../common/cache/memory-cache.service';
import { Edition } from '../entities/edition.entity';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../common/pagination/pagination';

@Injectable()
export class EditionsService {
  constructor(
    @InjectRepository(Edition)
    private readonly repo: Repository<Edition>,
    private readonly cache: MemoryCacheService,
  ) {}

  async findAll(rawPage?: number | string, rawPageSize?: number | string) {
    const { page, pageSize, skip, take } = normalizePagination(
      rawPage,
      rawPageSize,
    );
    const [items, totalItems] = await this.repo.findAndCount({
      order: { id: 'ASC' },
      skip,
      take,
    });
    return buildPaginatedResponse(items, totalItems, page, pageSize);
  }

  async upsert(payload: Partial<Edition>) {
    const saved = await this.repo.save(payload);
    this._invalidateCaches();
    return saved;
  }

  async toggle(id: number, enabled: boolean) {
    await this.repo.update({ id }, { enabled });
    const edition = await this.repo.findOne({ where: { id } });
    this._invalidateCaches();
    return edition;
  }

  private _invalidateCaches() {
    this.cache.deleteByPrefix('public-config:');
    this.cache.deleteByPrefix('admin:');
  }
}
