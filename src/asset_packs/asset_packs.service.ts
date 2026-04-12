import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import { MemoryCacheService } from '../common/cache/memory-cache.service';
import { storagePath } from '../common/storage-paths';
import { AssetPack } from '../entities/asset_pack.entity';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../common/pagination/pagination';

const MAX_QURAN_PAGES = 604;
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'webp']);

type EditionProfile = {
  folderName: string;
  leadingPagesToSkip: number;
};

type PackPage = {
  logicalPageNumber: number;
  importedPageNumber: number;
  fileName: string;
  fileExtension: string;
  relativePath: string;
};

type PackInspection = {
  pageCount: number;
  fileExtension: string;
  sizeBytes: number;
  availableImportedPages: number[];
  pages: PackPage[];
};

type CachedPackInspection = {
  inspection: PackInspection;
  fileLookup: Map<number, { absolutePath: string; contentType: string }>;
};

const EDITION_PROFILES: Record<string, EditionProfile> = {
  '10_line': { folderName: '10_line', leadingPagesToSkip: 0 },
  '13_line': { folderName: '13_line', leadingPagesToSkip: 0 },
  '14_line': { folderName: '14_line', leadingPagesToSkip: 0 },
  '15_line': { folderName: '15_line', leadingPagesToSkip: 0 },
  '16_line': { folderName: '16_line', leadingPagesToSkip: 1 },
  '17_line': { folderName: '17_line', leadingPagesToSkip: 0 },
  kanzul_iman: { folderName: 'kanzul_iman', leadingPagesToSkip: 0 },
};

@Injectable()
export class AssetPacksService {
  private readonly inspectionCache = new Map<string, CachedPackInspection>();

  constructor(
    @InjectRepository(AssetPack)
    private readonly repo: Repository<AssetPack>,
    private readonly cache: MemoryCacheService,
  ) {}

  async list(rawPage?: number | string, rawPageSize?: number | string) {
    const { page, pageSize, skip, take } = normalizePagination(
      rawPage,
      rawPageSize,
    );
    const [packs, totalItems] = await this.repo.findAndCount({
      order: { edition: 'ASC', version: 'DESC' },
      skip,
      take,
    });
    const items = await Promise.all(packs.map((pack) => this._summarizePack(pack)));
    return buildPaginatedResponse(items, totalItems, page, pageSize);
  }

  async activePacks() {
    return this.cache.getOrSet('asset-packs:active', 300_000, async () => {
      const packs = await this.repo.find({
        where: { active: true },
        order: { edition: 'ASC' },
      });
      return Promise.all(packs.map((pack) => this._summarizePack(pack)));
    });
  }

  async uploadPack(edition: string, version: string, filePath: string) {
    const normalizedEdition = this._normalizeEdition(edition);
    const normalizedVersion = this._normalizeVersion(version);
    const targetDir = this._packDirectory(normalizedEdition, normalizedVersion);

    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(targetDir, { recursive: true });

    try {
      const archive = new AdmZip(filePath);
      archive.extractAllTo(targetDir, true);
      this._flattenImportedImages(targetDir);
    } finally {
      fs.rmSync(filePath, { force: true });
    }

    const inspection = this._inspectPack(normalizedEdition, normalizedVersion);
    if (inspection.pages.length === 0) {
      throw new BadRequestException('No valid page images found in uploaded pack.');
    }

    const syncedPack = await this._syncPackMetadata(
      normalizedEdition,
      normalizedVersion,
    );
    this._invalidatePackCaches(normalizedEdition, normalizedVersion);
    return syncedPack;
  }

  async uploadPage(
    edition: string,
    version: string,
    logicalPageNumber: number,
    filePath: string,
  ) {
    const normalizedEdition = this._normalizeEdition(edition);
    const normalizedVersion = this._normalizeVersion(version);
    const validatedPageNumber = this._validateLogicalPageNumber(logicalPageNumber);
    const targetDir = this._packDirectory(normalizedEdition, normalizedVersion);
    const extension = this._normalizedExtension(filePath);

    if (!IMAGE_EXTENSIONS.has(extension)) {
      fs.rmSync(filePath, { force: true });
      throw new BadRequestException('Only PNG, JPG, and WEBP page files are supported.');
    }

    fs.mkdirSync(targetDir, { recursive: true });

    const current = this._inspectPack(normalizedEdition, normalizedVersion);
    if (current.pages.length > 0 && current.fileExtension !== extension) {
      fs.rmSync(filePath, { force: true });
      throw new BadRequestException(
        `This version already uses .${current.fileExtension} page files. Upload the same image format for all pages in one version.`,
      );
    }

    const importedPageNumber =
      validatedPageNumber + this._profileForEdition(normalizedEdition).leadingPagesToSkip;
    const targetBaseName = importedPageNumber.toString().padStart(3, '0');

    for (const candidateExtension of IMAGE_EXTENSIONS) {
      fs.rmSync(path.join(targetDir, `${targetBaseName}.${candidateExtension}`), {
        force: true,
      });
    }

    const targetPath = path.join(targetDir, `${targetBaseName}.${extension}`);

    try {
      fs.copyFileSync(filePath, targetPath);
    } finally {
      fs.rmSync(filePath, { force: true });
    }

    const syncedPack = await this._syncPackMetadata(
      normalizedEdition,
      normalizedVersion,
    );
    this._invalidatePackCaches(normalizedEdition, normalizedVersion);
    return syncedPack;
  }

  async importFromMobileAssets(
    sourcePath: string,
    version: string,
    editions?: string[],
  ) {
    const normalizedSourcePath = sourcePath.trim();
    if (!normalizedSourcePath) {
      throw new BadRequestException('Source path is required.');
    }
    if (!fs.existsSync(normalizedSourcePath)) {
      throw new NotFoundException('Source path does not exist.');
    }

    const normalizedVersion = this._normalizeVersion(version);
    const requestedEditions =
      editions && editions.length > 0
        ? editions.map((edition) => this._normalizeEdition(edition))
        : Object.keys(EDITION_PROFILES);

    const importedPacks = [];

    for (const edition of requestedEditions) {
      const profile = this._profileForEdition(edition);
      const sourceEditionDir = path.join(normalizedSourcePath, profile.folderName);
      if (!fs.existsSync(sourceEditionDir) || !fs.statSync(sourceEditionDir).isDirectory()) {
        continue;
      }

      const targetDir = this._packDirectory(edition, normalizedVersion);
      fs.rmSync(targetDir, { recursive: true, force: true });
      fs.mkdirSync(targetDir, { recursive: true });

      this._copyImportedImagesFromDirectory(sourceEditionDir, targetDir);
      const syncedPack = await this._syncPackMetadata(edition, normalizedVersion);
      if (syncedPack.pageCount > 0) {
        await this.activatePack(edition, normalizedVersion);
        const activePack = await this.repo.findOne({
          where: { edition, version: normalizedVersion },
        });
        if (activePack) {
          importedPacks.push(await this._decoratePack(activePack));
        }
        this._invalidatePackCaches(edition, normalizedVersion);
      }
    }

    if (importedPacks.length === 0) {
      throw new BadRequestException(
        'No valid edition folders with page images were found in the source path.',
      );
    }

    return importedPacks;
  }

  async activatePack(edition: string, version: string) {
    const normalizedEdition = this._normalizeEdition(edition);
    const normalizedVersion = this._normalizeVersion(version);
    const existing = await this.repo.findOne({
      where: { edition: normalizedEdition, version: normalizedVersion },
    });
    if (!existing) {
      throw new NotFoundException('Asset pack not found.');
    }

    await this.repo.update({ edition: normalizedEdition }, { active: false });
    await this.repo.update(
      { edition: normalizedEdition, version: normalizedVersion },
      { active: true },
    );

    const updated = await this.repo.findOne({
      where: { edition: normalizedEdition, version: normalizedVersion },
    });
    if (!updated) {
      throw new NotFoundException('Asset pack not found after activation.');
    }

    this._invalidatePackCaches(normalizedEdition, normalizedVersion);
    return this._decoratePack(updated);
  }

  async listPackPages(
    edition: string,
    version: string,
    rawPage?: number | string,
    rawPageSize?: number | string,
  ) {
    const normalizedEdition = this._normalizeEdition(edition);
    const normalizedVersion = this._normalizeVersion(version);
    const { page, pageSize, take } = normalizePagination(
      rawPage,
      rawPageSize,
    );
    const pack = await this.repo.findOne({
      where: { edition: normalizedEdition, version: normalizedVersion },
    });
    const inspection = this._inspectPack(normalizedEdition, normalizedVersion);
    const totalItems = inspection.pages.length;
    const totalPages = totalItems === 0 ? 1 : Math.ceil(totalItems / pageSize);
    const normalizedPage = Math.min(page, totalPages);
    const normalizedSkip = (normalizedPage - 1) * pageSize;
    const paginatedPages = inspection.pages.slice(
      normalizedSkip,
      normalizedSkip + take,
    );

    return {
      edition: normalizedEdition,
      version: normalizedVersion,
      active: pack?.active ?? false,
      pageCount: inspection.pageCount,
      fileExtension: inspection.fileExtension,
      sizeBytes: inspection.sizeBytes,
      availableImportedPages: inspection.availableImportedPages,
      pages: paginatedPages,
      meta: buildPaginatedResponse(
        paginatedPages,
        totalItems,
        normalizedPage,
        pageSize,
      ).meta,
    };
  }

  async deletePage(edition: string, version: string, logicalPageNumber: number) {
    const normalizedEdition = this._normalizeEdition(edition);
    const normalizedVersion = this._normalizeVersion(version);
    const validatedPageNumber = this._validateLogicalPageNumber(logicalPageNumber);
    const targetDir = this._packDirectory(normalizedEdition, normalizedVersion);
    const importedPageNumber =
      validatedPageNumber + this._profileForEdition(normalizedEdition).leadingPagesToSkip;
    const targetBaseName = importedPageNumber.toString().padStart(3, '0');

    let removed = false;
    for (const extension of IMAGE_EXTENSIONS) {
      const fileToRemove = path.join(targetDir, `${targetBaseName}.${extension}`);
      if (fs.existsSync(fileToRemove)) {
        fs.rmSync(fileToRemove, { force: true });
        removed = true;
      }
    }

    if (!removed) {
      throw new NotFoundException('Requested page image was not found in this pack.');
    }

    const syncedPack = await this._syncPackMetadata(
      normalizedEdition,
      normalizedVersion,
    );
    this._invalidatePackCaches(normalizedEdition, normalizedVersion);
    return syncedPack;
  }

  async updatePage(
    edition: string,
    version: string,
    currentLogicalPageNumber: number,
    nextLogicalPageNumber?: number,
    filePath?: string,
  ) {
    const normalizedEdition = this._normalizeEdition(edition);
    const normalizedVersion = this._normalizeVersion(version);
    const validatedCurrentPageNumber = this._validateLogicalPageNumber(
      currentLogicalPageNumber,
    );
    const validatedNextPageNumber =
      nextLogicalPageNumber === undefined
        ? validatedCurrentPageNumber
        : this._validateLogicalPageNumber(nextLogicalPageNumber);

    if (!filePath && validatedCurrentPageNumber === validatedNextPageNumber) {
      throw new BadRequestException(
        'Provide a new page number or a replacement image to update this page.',
      );
    }

    const targetDir = this._packDirectory(normalizedEdition, normalizedVersion);
    const currentFile = this._findPageFile(
      targetDir,
      validatedCurrentPageNumber + this._profileForEdition(normalizedEdition).leadingPagesToSkip,
    );

    if (!currentFile) {
      if (filePath) {
        fs.rmSync(filePath, { force: true });
      }
      throw new NotFoundException('Requested page image was not found in this pack.');
    }

    const profile = this._profileForEdition(normalizedEdition);
    const nextImportedPageNumber =
      validatedNextPageNumber + profile.leadingPagesToSkip;
    const nextBaseName = nextImportedPageNumber.toString().padStart(3, '0');
    const currentInspection = this._inspectPack(normalizedEdition, normalizedVersion);

    let nextExtension = currentFile.extension;
    if (filePath) {
      nextExtension = this._normalizedExtension(filePath);
      if (!IMAGE_EXTENSIONS.has(nextExtension)) {
        fs.rmSync(filePath, { force: true });
        throw new BadRequestException('Only PNG, JPG, and WEBP page files are supported.');
      }

      const otherPages = currentInspection.pages.filter(
        (page) => page.logicalPageNumber !== validatedCurrentPageNumber,
      );
      if (otherPages.length > 0 && currentInspection.fileExtension !== nextExtension) {
        fs.rmSync(filePath, { force: true });
        throw new BadRequestException(
          `This version uses .${currentInspection.fileExtension} page files. Upload the same image format while other pages exist in this version.`,
        );
      }
    }

    const collision = this._findPageFile(targetDir, nextImportedPageNumber);
    if (
      collision &&
      (collision.path !== currentFile.path || collision.extension !== currentFile.extension)
    ) {
      if (filePath) {
        fs.rmSync(filePath, { force: true });
      }
      throw new BadRequestException(
        `Page ${validatedNextPageNumber} already exists in this version.`,
      );
    }

    const nextPath = path.join(targetDir, `${nextBaseName}.${nextExtension}`);

    try {
      if (filePath) {
        for (const extension of IMAGE_EXTENSIONS) {
          fs.rmSync(path.join(targetDir, `${nextBaseName}.${extension}`), {
            force: true,
          });
        }
        fs.copyFileSync(filePath, nextPath);
      } else if (currentFile.path !== nextPath) {
        fs.renameSync(currentFile.path, nextPath);
      }

      if (currentFile.path !== nextPath && fs.existsSync(currentFile.path)) {
        fs.rmSync(currentFile.path, { force: true });
      }

      if (
        currentFile.path === nextPath &&
        currentFile.extension !== nextExtension &&
        fs.existsSync(currentFile.path)
      ) {
        fs.rmSync(currentFile.path, { force: true });
      }
    } finally {
      if (filePath) {
        fs.rmSync(filePath, { force: true });
      }
    }

    const syncedPack = await this._syncPackMetadata(
      normalizedEdition,
      normalizedVersion,
    );
    this._invalidatePackCaches(normalizedEdition, normalizedVersion);
    return syncedPack;
  }

  resolvePageFile(
    edition: string,
    version: string,
    importedPageNumber: number,
  ): { absolutePath: string; contentType: string } {
    const normalizedEdition = this._normalizeEdition(edition);
    const normalizedVersion = this._normalizeVersion(version);
    const normalizedImportedPage = Number(importedPageNumber);

    if (!Number.isInteger(normalizedImportedPage) || normalizedImportedPage <= 0) {
      throw new BadRequestException('Imported page number must be a positive integer.');
    }

    const cacheKey = this._inspectionCacheKey(
      normalizedEdition,
      normalizedVersion,
    );
    let file = this._getCachedInspection(
      normalizedEdition,
      normalizedVersion,
    ).fileLookup.get(normalizedImportedPage);

    if (!file) {
      this.inspectionCache.delete(cacheKey);
      file = this._getCachedInspection(
        normalizedEdition,
        normalizedVersion,
      ).fileLookup.get(normalizedImportedPage);
    }

    if (!file) {
      throw new NotFoundException('Requested Quran page image was not found.');
    }

    return file;
  }

  private async _decoratePack(pack: AssetPack) {
    const inspection = this._inspectPack(pack.edition, pack.version);
    const profile = this._profileForEdition(pack.edition);
    return {
      id: pack.id,
      edition: pack.edition,
      folderName: profile.folderName,
      version: pack.version,
      active: pack.active,
      storagePath: pack.storagePath,
      pageCount: inspection.pageCount,
      fileExtension: inspection.fileExtension,
      sizeBytes: inspection.sizeBytes,
      availableImportedPages: inspection.availableImportedPages,
      pages: inspection.pages,
    };
  }

  private async _summarizePack(pack: AssetPack) {
    const inspection = this._inspectPack(pack.edition, pack.version);
    const profile = this._profileForEdition(pack.edition);
    return {
      id: pack.id,
      edition: pack.edition,
      folderName: profile.folderName,
      version: pack.version,
      active: pack.active,
      storagePath: pack.storagePath,
      pageCount: inspection.pageCount,
      fileExtension: inspection.fileExtension,
      sizeBytes: inspection.sizeBytes,
      availableImportedPages: this._compactImportedPages(
        inspection.availableImportedPages,
        inspection.pageCount,
      ),
    };
  }

  private async _syncPackMetadata(edition: string, version: string) {
    const inspection = this._inspectPack(edition, version);
    const existing = await this.repo.findOne({ where: { edition, version } });

    if (inspection.pages.length === 0) {
      if (existing) {
        await this.repo.delete({ id: existing.id });
      }
      return {
        id: existing?.id ?? 0,
        edition,
        version,
        active: false,
        storagePath: this._packDirectory(edition, version),
        pageCount: 0,
        fileExtension: 'png',
        sizeBytes: 0,
        availableImportedPages: [] as number[],
        pages: [] as PackPage[],
      };
    }

    const entity = existing ?? this.repo.create({ edition, version, active: false });
    entity.storagePath = this._packDirectory(edition, version);
    entity.pageCount = inspection.pageCount;
    entity.fileExtension = inspection.fileExtension;
    entity.sizeBytes = inspection.sizeBytes;

    const saved = await this.repo.save(entity);
    return this._decoratePack(saved);
  }

  private _inspectPack(edition: string, version: string): PackInspection {
    return this._getCachedInspection(edition, version).inspection;
  }

  private _getCachedInspection(
    edition: string,
    version: string,
  ): CachedPackInspection {
    const cacheKey = this._inspectionCacheKey(edition, version);

    const cached = this.inspectionCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const profile = this._profileForEdition(edition);
    const directory = this._packDirectory(edition, version);

    if (!fs.existsSync(directory)) {
      const emptyEntry: CachedPackInspection = {
        inspection: {
          pageCount: 0,
          fileExtension: 'png',
          sizeBytes: 0,
          availableImportedPages: [],
          pages: [],
        },
        fileLookup: new Map(),
      };
      this.inspectionCache.set(cacheKey, emptyEntry);
      return emptyEntry;
    }

    const fileLookup = new Map<
      number,
      { absolutePath: string; contentType: string }
    >();

    const pageFiles = fs
      .readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const extension = this._normalizedExtension(entry.name);
        if (!IMAGE_EXTENSIONS.has(extension)) {
          return null;
        }

        const baseName = path.basename(entry.name, path.extname(entry.name));
        const importedPageNumber = Number(baseName);
        if (!Number.isInteger(importedPageNumber) || importedPageNumber <= 0) {
          return null;
        }

        const absolutePath = path.join(directory, entry.name);
        const stats = fs.statSync(absolutePath);
        const logicalPageNumber = Math.max(
          1,
          importedPageNumber - profile.leadingPagesToSkip,
        );

        fileLookup.set(importedPageNumber, {
          absolutePath,
          contentType: this._contentTypeForExtension(extension),
        });

        return {
          logicalPageNumber,
          importedPageNumber,
          fileName: entry.name,
          fileExtension: extension,
          relativePath: `/assets/asset_packs/${profile.folderName}/${version}/${entry.name}`,
          sizeBytes: stats.size,
        };
      })
      .filter((entry): entry is PackPage & { sizeBytes: number } => entry !== null)
      .sort((left, right) => left.importedPageNumber - right.importedPageNumber);

    const availableImportedPages = pageFiles.map((entry) => entry.importedPageNumber);
    const totalBytes = pageFiles.reduce((sum, entry) => sum + entry.sizeBytes, 0);
    const firstExtension = pageFiles[0]?.fileExtension ?? 'png';

    const inspection: PackInspection = {
      pageCount: availableImportedPages[availableImportedPages.length - 1] ?? 0,
      fileExtension: firstExtension,
      sizeBytes: totalBytes,
      availableImportedPages,
      pages: pageFiles.map(({ sizeBytes: _, ...entry }) => entry),
    };

    const cacheEntry: CachedPackInspection = {
      inspection,
      fileLookup,
    };

    this.inspectionCache.set(cacheKey, cacheEntry);
    return cacheEntry;
  }

  private _flattenImportedImages(directory: string) {
    const nestedFiles = this._collectFiles(directory).filter((filePath) => {
      if (path.dirname(filePath) === directory) {
        return false;
      }
      const extension = this._normalizedExtension(filePath);
      if (!IMAGE_EXTENSIONS.has(extension)) {
        return false;
      }
      const importedPageNumber = Number(path.basename(filePath, path.extname(filePath)));
      return Number.isInteger(importedPageNumber) && importedPageNumber > 0;
    });

    for (const filePath of nestedFiles) {
      const targetPath = path.join(directory, path.basename(filePath));
      fs.copyFileSync(filePath, targetPath);
      fs.rmSync(filePath, { force: true });
    }
  }

  private _copyImportedImagesFromDirectory(sourceDirectory: string, targetDirectory: string) {
    const importedFiles = this._collectFiles(sourceDirectory)
      .filter((filePath) => {
        const extension = this._normalizedExtension(filePath);
        if (!IMAGE_EXTENSIONS.has(extension)) {
          return false;
        }

        const baseName = path.basename(filePath, path.extname(filePath));
        const importedPageNumber = Number(baseName);
        return Number.isInteger(importedPageNumber) && importedPageNumber > 0;
      })
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

    for (const sourceFilePath of importedFiles) {
      const targetPath = path.join(targetDirectory, path.basename(sourceFilePath));
      fs.copyFileSync(sourceFilePath, targetPath);
    }
  }

  private _collectFiles(directory: string): string[] {
    if (!fs.existsSync(directory)) {
      return [];
    }

    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return this._collectFiles(entryPath);
      }
      return [entryPath];
    });
  }

  private _normalizeEdition(edition: string) {
    const normalized = edition.trim().toLowerCase();
    if (!normalized) {
      throw new BadRequestException('Edition is required.');
    }
    return normalized;
  }

  private _normalizeVersion(version: string) {
    const normalized = version.trim();
    if (!normalized) {
      throw new BadRequestException('Version is required.');
    }
    return normalized;
  }

  private _validateLogicalPageNumber(value: number) {
    if (!Number.isInteger(value) || value < 1 || value > MAX_QURAN_PAGES) {
      throw new BadRequestException(
        `Page number must be an integer between 1 and ${MAX_QURAN_PAGES}.`,
      );
    }
    return value;
  }

  private _profileForEdition(edition: string): EditionProfile {
    return EDITION_PROFILES[edition] ?? {
      folderName: edition.replace(/[^a-z0-9_-]/g, '_'),
      leadingPagesToSkip: 0,
    };
  }

  private _packDirectory(edition: string, version: string) {
    const profile = this._profileForEdition(edition);
    return storagePath('asset_packs', profile.folderName, version);
  }

  private _normalizedExtension(filePath: string) {
    const extension = path.extname(filePath).toLowerCase().replace('.', '');
    if (extension === 'jpeg') {
      return 'jpg';
    }
    return extension;
  }

  private _contentTypeForExtension(extension: string) {
    switch (extension) {
      case 'png':
        return 'image/png';
      case 'jpg':
        return 'image/jpeg';
      case 'webp':
        return 'image/webp';
      default:
        return 'application/octet-stream';
    }
  }

  private _findPageFile(directory: string, importedPageNumber: number) {
    const paddedBaseName = importedPageNumber.toString().padStart(3, '0');
    const rawBaseName = importedPageNumber.toString();

    for (const extension of IMAGE_EXTENSIONS) {
      for (const candidateBaseName of [paddedBaseName, rawBaseName]) {
        const candidatePath = path.join(directory, `${candidateBaseName}.${extension}`);
        if (fs.existsSync(candidatePath)) {
          return { path: candidatePath, extension };
        }
      }
    }

    return null;
  }

  private _compactImportedPages(
    availableImportedPages: number[],
    pageCount: number,
  ) {
    if (availableImportedPages.length !== pageCount) {
      return availableImportedPages;
    }

    for (let index = 0; index < availableImportedPages.length; index += 1) {
      if (availableImportedPages[index] !== index + 1) {
        return availableImportedPages;
      }
    }

    return [];
  }

  private _inspectionCacheKey(edition: string, version: string) {
    return `${edition}:${version}`;
  }

  private _invalidatePackCaches(edition: string, version: string) {
    this.inspectionCache.delete(this._inspectionCacheKey(edition, version));
    this.cache.delete('asset-packs:active');
    this.cache.deleteByPrefix('public-config:');
    this.cache.deleteByPrefix('admin:');
  }
}
