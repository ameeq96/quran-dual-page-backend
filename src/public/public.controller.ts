import { Body, Controller, Get, Post, Query, Req } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Announcement } from "../entities/announcement.entity";
import { AppSetting } from "../entities/app_setting.entity";
import { Edition } from "../entities/edition.entity";
import { FeatureFlag } from "../entities/feature_flag.entity";
import { Request } from "express";
import { MemoryCacheService } from "../common/cache/memory-cache.service";
import { ContentDatasetsService } from "../content_datasets/content_datasets.service";
import { PublicAiService } from "./public_ai.service";
import { PublicSearchService } from "./public_search.service";
import { AssetPacksService } from "../asset_packs/asset_packs.service";

@Controller("public")
export class PublicController {
  constructor(
    private readonly assetPacksService: AssetPacksService,
    private readonly contentDatasetsService: ContentDatasetsService,
    private readonly publicAiService: PublicAiService,
    private readonly publicSearchService: PublicSearchService,
    private readonly cache: MemoryCacheService,
    @InjectRepository(Announcement)
    private readonly announcements: Repository<Announcement>,
    @InjectRepository(Edition) private readonly editions: Repository<Edition>,
    @InjectRepository(AppSetting)
    private readonly settings: Repository<AppSetting>,
    @InjectRepository(FeatureFlag)
    private readonly flags: Repository<FeatureFlag>,
  ) {}

  @Get("config")
  async getConfig(@Req() req: Request) {
    const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
    const host = req.get("host");
    const cacheKey = `public-config:${proto}:${host ?? "unknown-host"}`;

    return this.cache.getOrSet(cacheKey, 60_000, async () => {
      const publicBaseUrl = host ? `${proto}://${host}` : "";
      const assetsBaseUrl = publicBaseUrl ? `${publicBaseUrl}/assets` : "";

      const [
        activeAssetPacks,
        activeDatasets,
        editions,
        settings,
        flags,
        announcements,
      ] = await Promise.all([
        this.assetPacksService.activePacks(),
        this.contentDatasetsService.activeDatasets(),
        this.editions.find({
          order: { id: "ASC" },
          select: { key: true, label: true, enabled: true },
        }),
        this.settings.find({ select: { key: true, value: true } }),
        this.flags.find({ select: { key: true, enabled: true } }),
        this.announcements.find({
          where: { active: true },
          select: { id: true, title: true, body: true, publishAt: true },
        }),
      ]);

      return {
        assetsBaseUrl,
        assetPacks: activeAssetPacks.map((pack) => ({
          edition: pack.edition,
          folderName: pack.folderName,
          version: pack.version,
          pageCount: pack.pageCount,
          fileExtension: pack.fileExtension,
          availableImportedPages: pack.availableImportedPages,
          contiguousImportedPageStart: pack.contiguousImportedPageStart,
          contiguousImportedPageEnd: pack.contiguousImportedPageEnd,
        })),
        contentDatasets: activeDatasets.map((dataset) => ({
          key: dataset.key,
          version: dataset.version,
          url: publicBaseUrl
            ? `${publicBaseUrl}${dataset.publicPath}`
            : dataset.publicPath,
        })),
        editions: editions.map((edition) => ({
          key: edition.key,
          label: edition.label,
          enabled: edition.enabled,
        })),
        settings: settings
          .filter((setting) => this._isPublicSetting(setting.key))
          .map((setting) => ({ key: setting.key, value: setting.value })),
        featureFlags: flags.map((flag) => ({
          key: flag.key,
          enabled: flag.enabled,
        })),
        announcements: announcements.map((item) => ({
          id: item.id,
          title: item.title,
          body: item.body,
          publishAt: item.publishAt,
        })),
        serverTime: new Date().toISOString(),
      };
    });
  }

  @Post("ai/run")
  async runAiTool(
    @Body()
    body: {
      tool: string;
      toolTitle: string;
      toolInstruction: string;
      userInput: string;
      responseLanguage: string;
      responseDepth: string;
      contextPromptBlock: string;
    },
  ) {
    return this.publicAiService.runTool(body);
  }

  @Get("search/surahs")
  searchSurahs(@Query("q") query?: string) {
    return this.publicSearchService.searchSurahs(query ?? "");
  }

  @Get("search/juzs")
  searchJuzs(@Query("q") query?: string) {
    return this.publicSearchService.searchJuzs(query ?? "");
  }

  @Get("search/markers")
  searchMarkers(
    @Query("category") category?: string,
    @Query("q") query?: string,
  ) {
    return this.publicSearchService.searchMarkers(
      category ?? "ruku",
      query ?? "",
    );
  }

  @Get("search/ayahs")
  searchAyahs(@Query("q") query?: string, @Query("limit") limit?: string) {
    return this.publicSearchService.searchAyahs(
      query ?? "",
      limit ? Number(limit) : undefined,
    );
  }

  @Get("search/text")
  searchText(@Query("q") query?: string, @Query("limit") limit?: string) {
    return this.publicSearchService.searchText(
      query ?? "",
      limit ? Number(limit) : undefined,
    );
  }

  private _isPublicSetting(key: string) {
    const normalized = key.trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    if (
      normalized === "ai_secret" ||
      normalized === "ai_custom_headers_json" ||
      normalized === "ai_system_prompt" ||
      normalized.includes("password") ||
      normalized.includes("secret") ||
      normalized.includes("token") ||
      normalized.endsWith("_key")
    ) {
      return false;
    }
    return true;
  }
}
