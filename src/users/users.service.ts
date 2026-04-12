import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MemoryCacheService } from '../common/cache/memory-cache.service';
import { AppUser } from '../entities/app_user.entity';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../common/pagination/pagination';

type SyncSummary = {
  notesCount: number;
  favoritePagesCount: number;
  bookmarksCount: number;
  historyCount: number;
  hifzCount: number;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(AppUser)
    private readonly repo: Repository<AppUser>,
    private readonly cache: MemoryCacheService,
  ) {}

  async findAll(rawPage?: number | string, rawPageSize?: number | string) {
    const { page, pageSize, skip, take } = normalizePagination(
      rawPage,
      rawPageSize,
    );
    const [users, totalItems] = await this.repo.findAndCount({
      order: { id: 'DESC' },
      skip,
      take,
    });
    const items = users.map((user) => ({
      ...this._buildUserSummary(user),
      id: user.id,
      email: user.email,
      deviceId: user.deviceId,
      active: user.active,
      lastPageNumber: user.lastPageNumber,
      syncUpdatedAt: user.syncUpdatedAt,
      appVersion: user.appVersion,
      hasSyncPayload: !!user.syncPayloadJson,
    }));

    return buildPaginatedResponse(items, totalItems, page, pageSize);
  }

  async findSyncState(id: number) {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) {
      return null;
    }

    const payload = this._parsePayload(user.syncPayloadJson);
    return {
      ...this._buildUserSummary(user),
      id: user.id,
      email: user.email,
      deviceId: user.deviceId,
      active: user.active,
      lastPageNumber: user.lastPageNumber,
      syncUpdatedAt: user.syncUpdatedAt,
      appVersion: user.appVersion,
      payload,
    };
  }

  async toggleActive(id: number, active: boolean) {
    await this.repo.update({ id }, { active });
    const user = await this.repo.findOne({ where: { id } });
    this._invalidateAdminCaches();
    return user;
  }

  async pushSync(payload: {
    deviceId: string;
    email?: string | null;
    appVersion?: string | null;
    lastPageNumber?: number | null;
    payload?: Record<string, unknown>;
  }) {
    const deviceId = payload.deviceId?.trim();
    if (!deviceId) {
      return { success: false, error: 'deviceId missing' };
    }

    let user =
      (await this.repo.findOne({ where: { deviceId } })) ??
      (payload.email?.trim()
        ? await this.repo.findOne({ where: { email: payload.email.trim() } })
        : null);

    const now = new Date();
    if (!user) {
      user = this.repo.create({
        deviceId,
        email: payload.email?.trim() || null,
        active: true,
      });
    }

    user.deviceId = deviceId;
    user.email = payload.email?.trim() || user.email || null;
    user.active = true;
    user.lastActiveAt = now;
    user.lastPageNumber = payload.lastPageNumber ?? user.lastPageNumber ?? null;
    user.syncUpdatedAt = now;
    user.appVersion = payload.appVersion?.trim() || user.appVersion || null;
    user.syncPayloadJson = JSON.stringify(payload.payload ?? {});

    const saved = await this.repo.save(user);
    this._invalidateAdminCaches();
    return {
      success: true,
      userId: saved.id,
      syncUpdatedAt: saved.syncUpdatedAt,
    };
  }

  async pullSync(deviceId: string) {
    const normalized = deviceId.trim();
    if (!normalized) {
      return { success: false, error: 'deviceId missing' };
    }

    const user = await this.repo.findOne({ where: { deviceId: normalized } });
    if (!user) {
      return {
        success: true,
        found: false,
      };
    }

    return {
      success: true,
      found: true,
      ...this._buildUserSummary(user),
      email: user.email,
      lastPageNumber: user.lastPageNumber,
      syncUpdatedAt: user.syncUpdatedAt,
      payload: this._parsePayload(user.syncPayloadJson),
    };
  }

  async getSyncAggregateSummary() {
    return this.cache.getOrSet('admin:sync-aggregate', 10_000, async () => {
      const users = await this.repo.find({
        select: {
          active: true,
          syncPayloadJson: true,
          syncUpdatedAt: true,
        },
      });

      let syncedUsers = 0;
      let activeSyncedUsers = 0;
      let totalNotes = 0;
      let totalFavoritePages = 0;
      let totalBookmarks = 0;
      let totalHistoryEntries = 0;
      let totalHifzEntries = 0;
      let latestSyncAt: Date | null = null;

      for (const user of users) {
        const hasSync = !!user.syncPayloadJson?.trim();
        if (!hasSync) {
          continue;
        }

        syncedUsers += 1;
        if (user.active) {
          activeSyncedUsers += 1;
        }

        const summary = this._summarizePayload(this._parsePayload(user.syncPayloadJson));
        totalNotes += summary.notesCount;
        totalFavoritePages += summary.favoritePagesCount;
        totalBookmarks += summary.bookmarksCount;
        totalHistoryEntries += summary.historyCount;
        totalHifzEntries += summary.hifzCount;

        if (
          user.syncUpdatedAt &&
          (latestSyncAt == null || user.syncUpdatedAt > latestSyncAt)
        ) {
          latestSyncAt = user.syncUpdatedAt;
        }
      }

      return {
        syncedUsers,
        activeSyncedUsers,
        totalNotes,
        totalFavoritePages,
        totalBookmarks,
        totalHistoryEntries,
        totalHifzEntries,
        latestSyncAt,
      };
    });
  }

  private _invalidateAdminCaches() {
    this.cache.deleteByPrefix('admin:');
  }

  private _parsePayload(jsonPayload: string | null) {
    if (!jsonPayload || !jsonPayload.trim()) {
      return {};
    }

    try {
      return JSON.parse(jsonPayload) as Record<string, unknown>;
    } catch (_) {
      return {};
    }
  }

  private _buildUserSummary(user: AppUser) {
    return this._summarizePayload(this._parsePayload(user.syncPayloadJson));
  }

  private _summarizePayload(payload: Record<string, unknown>): SyncSummary {
    const pageNotes = this._safeRecord(payload.pageNotes);
    return {
      notesCount: Object.keys(pageNotes).length,
      favoritePagesCount: this._safeArray(payload.favoritePages).length,
      bookmarksCount: this._safeArray(payload.bookmarks).length,
      historyCount: this._safeArray(payload.readingHistory).length,
      hifzCount: this._safeArray(payload.hifzReviewEntries).length,
    };
  }

  private _safeArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private _safeRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }
}
