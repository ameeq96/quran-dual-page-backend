import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import { MemoryCacheService } from '../common/cache/memory-cache.service';
import { ContentDataset } from '../entities/content_dataset.entity';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../common/pagination/pagination';

@Injectable()
export class ContentDatasetsService {
  constructor(
    @InjectRepository(ContentDataset)
    private readonly repo: Repository<ContentDataset>,
    private readonly cache: MemoryCacheService,
  ) {}

  async list(rawPage?: number | string, rawPageSize?: number | string) {
    const { page, pageSize, skip, take } = normalizePagination(
      rawPage,
      rawPageSize,
    );
    const [items, totalItems] = await this.repo.findAndCount({
      order: { key: 'ASC', version: 'DESC' },
      skip,
      take,
    });
    return buildPaginatedResponse(items, totalItems, page, pageSize);
  }

  async uploadDataset(key: string, version: string, filePath: string) {
    const extension = path.extname(filePath).toLowerCase();
    const targetExtension = extension === '.json' ? '.json' : '.json';
    const storageRoot = path.join(process.cwd(), 'storage', 'content_datasets', key);
    fs.mkdirSync(storageRoot, { recursive: true });

    const targetPath = path.join(storageRoot, `${version}${targetExtension}`);
    fs.rmSync(targetPath, { force: true });
    fs.copyFileSync(filePath, targetPath);

    const stats = fs.statSync(targetPath);
    const publicPath = `/assets/content_datasets/${key}/${version}${targetExtension}`;
    const dataset = await this.repo.save(
      this.repo.create({
        key,
        version,
        storagePath: targetPath,
        publicPath,
        sizeBytes: stats.size,
        active: false,
      }),
    );

    fs.rmSync(filePath, { force: true });
    this._invalidateCaches();
    return dataset;
  }

  async activateDataset(key: string, version: string) {
    const datasets = await this.repo.find({ where: { key } });
    for (const dataset of datasets) {
      dataset.active = dataset.version === version;
    }
    await this.repo.save(datasets);
    this._invalidateCaches();
    return this.repo.findOne({ where: { key, version } });
  }

  activeDatasets() {
    return this.cache.getOrSet('content-datasets:active', 10_000, () =>
      this.repo.find({ where: { active: true } }),
    );
  }

  private _invalidateCaches() {
    this.cache.delete('content-datasets:active');
    this.cache.deleteByPrefix('public-config:');
    this.cache.deleteByPrefix('admin:');
  }
}
