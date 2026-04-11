import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Announcement } from '../entities/announcement.entity';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../common/pagination/pagination';

@Injectable()
export class AnnouncementsService {
  constructor(
    @InjectRepository(Announcement)
    private readonly repo: Repository<Announcement>,
  ) {}

  async findAll(rawPage?: number | string, rawPageSize?: number | string) {
    const { page, pageSize, skip, take } = normalizePagination(
      rawPage,
      rawPageSize,
    );
    const [items, totalItems] = await this.repo.findAndCount({
      order: { id: 'DESC' },
      skip,
      take,
    });
    return buildPaginatedResponse(items, totalItems, page, pageSize);
  }

  upsert(payload: Partial<Announcement>) {
    return this.repo.save(payload);
  }

  async toggle(id: number, active: boolean) {
    await this.repo.update({ id }, { active });
    return this.repo.findOne({ where: { id } });
  }
}
