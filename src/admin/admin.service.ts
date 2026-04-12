import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MemoryCacheService } from '../common/cache/memory-cache.service';
import { Announcement } from '../entities/announcement.entity';
import { AppSetting } from '../entities/app_setting.entity';
import { AppUser } from '../entities/app_user.entity';
import { AssetPack } from '../entities/asset_pack.entity';
import { ContentDataset } from '../entities/content_dataset.entity';
import { Edition } from '../entities/edition.entity';
import { FeatureFlag } from '../entities/feature_flag.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(AppUser)
    private readonly usersRepo: Repository<AppUser>,
    @InjectRepository(Edition)
    private readonly editionsRepo: Repository<Edition>,
    @InjectRepository(AssetPack)
    private readonly assetPacksRepo: Repository<AssetPack>,
    @InjectRepository(ContentDataset)
    private readonly contentDatasetsRepo: Repository<ContentDataset>,
    @InjectRepository(Announcement)
    private readonly announcementsRepo: Repository<Announcement>,
    @InjectRepository(AppSetting)
    private readonly settingsRepo: Repository<AppSetting>,
    @InjectRepository(FeatureFlag)
    private readonly flagsRepo: Repository<FeatureFlag>,
    private readonly cache: MemoryCacheService,
  ) {}

  async getOverview() {
    return this.cache.getOrSet('admin:overview', 10_000, async () => {
      const [
        totalUsers,
        activeUsers,
        syncSummary,
        totalEditions,
        enabledEditions,
        totalAssetPacks,
        activeAssetPacks,
        totalDatasets,
        activeDatasets,
        totalAnnouncements,
        activeAnnouncements,
        totalFlags,
        enabledFlags,
        settingsCount,
        latestAnnouncement,
        defaultEdition,
        aiLanguage,
        aiDepth,
        aiProvider,
        aiModel,
        aiStatusLabel,
        appTitle,
      ] = await Promise.all([
        this.usersRepo.count(),
        this.usersRepo.count({ where: { active: true } }),
        this._buildSyncSummary(),
        this.editionsRepo.count(),
        this.editionsRepo.count({ where: { enabled: true } }),
        this.assetPacksRepo.count(),
        this.assetPacksRepo.count({ where: { active: true } }),
        this.contentDatasetsRepo.count(),
        this.contentDatasetsRepo.count({ where: { active: true } }),
        this.announcementsRepo.count(),
        this.announcementsRepo.count({ where: { active: true } }),
        this.flagsRepo.count(),
        this.flagsRepo.count({ where: { enabled: true } }),
        this.settingsRepo.count(),
        this.announcementsRepo.find({
          order: { id: 'DESC' },
          take: 1,
        }),
        this.settingsRepo.findOne({ where: { key: 'default_mushaf_edition' } }),
        this.settingsRepo.findOne({ where: { key: 'ai_default_language' } }),
        this.settingsRepo.findOne({ where: { key: 'ai_default_depth' } }),
        this.settingsRepo.findOne({ where: { key: 'ai_provider' } }),
        this.settingsRepo.findOne({ where: { key: 'ai_model' } }),
        this.settingsRepo.findOne({ where: { key: 'ai_status_label' } }),
        this.settingsRepo.findOne({ where: { key: 'app_title' } }),
      ]);

      return {
        appName:
          appTitle?.value || process.env.APP_NAME || 'Quran Dual Page & Multi-Line Reader',
        activeUsers,
        totalUsers,
        syncedUsers: syncSummary.syncedUsers,
        activeSyncedUsers: syncSummary.activeSyncedUsers,
        totalNotes: syncSummary.totalNotes,
        totalFavoritePages: syncSummary.totalFavoritePages,
        totalBookmarks: syncSummary.totalBookmarks,
        totalHistoryEntries: syncSummary.totalHistoryEntries,
        totalHifzEntries: syncSummary.totalHifzEntries,
        totalSessions: 0,
        enabledEditions,
        totalEditions,
        activeAssetPacks,
        totalAssetPacks,
        activeDatasets,
        totalDatasets,
        activeAnnouncements,
        totalAnnouncements,
        enabledFlags,
        totalFlags,
        settingsCount,
        defaultEdition: defaultEdition?.value ?? '16_lines',
        aiLanguage: aiLanguage?.value ?? 'english',
        aiDepth: aiDepth?.value ?? 'fast',
        aiProvider: this._formatAiProviderLabel(aiProvider?.value),
        aiModel: aiModel?.value ?? 'built-in local mode',
        aiStatusLabel: aiStatusLabel?.value ?? 'Local AI mode in app',
        lastAnnouncementTitle: latestAnnouncement?.[0]?.title ?? null,
        lastSync: syncSummary.latestSyncAt?.toISOString() ?? null,
      };
    });
  }

  async getContentStatus() {
    return this.cache.getOrSet('admin:content-status', 10_000, async () => {
      const [editions, assetPacks, contentDatasets, flags, settings, announcements] =
        await Promise.all([
          this.editionsRepo.find({ order: { id: 'ASC' } }),
          this.assetPacksRepo.find({ where: { active: true }, order: { edition: 'ASC' } }),
          this.contentDatasetsRepo.find({ where: { active: true }, order: { key: 'ASC' } }),
          this.flagsRepo.find({ where: { enabled: true }, order: { key: 'ASC' } }),
          this.settingsRepo.find({ order: { key: 'ASC' } }),
          this.announcementsRepo.find({ where: { active: true }, order: { id: 'DESC' } }),
        ]);

      return {
        editionsAvailable: editions.filter((item) => item.enabled).map((item) => item.key),
        editions,
        assetsOnDevice: assetPacks.length > 0,
        assetPacks: assetPacks.map((item) => ({
          edition: item.edition,
          version: item.version,
          pageCount: item.pageCount,
        })),
        contentDatasets: contentDatasets.map((item) => ({
          key: item.key,
          version: item.version,
        })),
        enabledFlags: flags.map((item) => item.key),
        settings: settings.map((item) => ({ key: item.key, value: item.value })),
        announcements: announcements.map((item) => ({
          id: item.id,
          title: item.title,
          body: item.body,
        })),
        lastIndexBuild: null,
      };
    });
  }

  private async _buildSyncSummary() {
    const users = await this.usersRepo.find({
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
      const payload = this._parsePayload(user.syncPayloadJson);
      if (Object.keys(payload).length === 0) {
        continue;
      }

      syncedUsers += 1;
      if (user.active) {
        activeSyncedUsers += 1;
      }

      totalNotes += Object.keys(this._safeRecord(payload.pageNotes)).length;
      totalFavoritePages += this._safeArray(payload.favoritePages).length;
      totalBookmarks += this._safeArray(payload.bookmarks).length;
      totalHistoryEntries += this._safeArray(payload.readingHistory).length;
      totalHifzEntries += this._safeArray(payload.hifzReviewEntries).length;

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

  private _safeArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private _safeRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private _formatAiProviderLabel(value?: string | null) {
    switch ((value ?? '').trim().toLowerCase()) {
      case 'ollama':
        return 'Ollama';
      case 'openai':
      case 'chatgpt':
        return 'ChatGPT';
      case 'custom':
        return 'Custom AI';
      case 'local':
      case '':
      default:
        return 'Local assistant';
    }
  }
}
