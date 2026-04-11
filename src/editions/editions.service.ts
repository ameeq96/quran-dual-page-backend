import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  upsert(payload: Partial<Edition>) {
    return this.repo.save(payload);
  }

  async toggle(id: number, enabled: boolean) {
    await this.repo.update({ id }, { enabled });
    return this.repo.findOne({ where: { id } });
  }
}
