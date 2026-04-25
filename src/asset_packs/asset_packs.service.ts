import { Injectable } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { MemoryCacheService } from "../common/cache/memory-cache.service";
import { storagePath } from "../common/storage-paths";

export type ResolvedAssetPack = {
  edition: string;
  folderName: string;
  version: string;
  pageCount: number;
  fileExtension: string;
  availableImportedPages: number[];
  contiguousImportedPageStart?: number;
  contiguousImportedPageEnd?: number;
  sizeBytes: number;
  storagePath: string;
  publicPath: string;
  active: boolean;
};

export type ResolvedZipAssetPack = {
  key: string;
  edition: string;
  fileName: string;
  sizeBytes: number;
  storagePath: string;
  publicPath: string;
  modifiedAt: string;
};

type PackCandidate = ResolvedAssetPack & {
  latestModifiedTimeMs: number;
};

type ExtensionVariant = {
  extension: string;
  pageNumbers: Set<number>;
  sizeBytes: number;
  latestModifiedTimeMs: number;
};

const IMAGE_FILE_PATTERN = /^(\d+)\.(jpe?g|png|webp)$/i;
const EDITION_ORDER = [
  "10_line",
  "13_line",
  "14_line",
  "15_line",
  "16_line",
  "17_line",
  "kanzul_iman",
] as const;

@Injectable()
export class AssetPacksService {
  constructor(private readonly cache: MemoryCacheService) {}

  activePacks(): Promise<ResolvedAssetPack[]> {
    return this.cache.getOrSet("asset-packs:active", 60_000, async () =>
      this._discoverActivePacks(),
    );
  }

  zipCatalog(): Promise<ResolvedZipAssetPack[]> {
    return this.cache.getOrSet("asset-packs:zip-catalog", 60_000, async () =>
      this._discoverZipCatalog(),
    );
  }

  private _discoverZipCatalog(): ResolvedZipAssetPack[] {
    const root = storagePath("asset_packs");
    if (!fs.existsSync(root)) {
      return [];
    }

    const byEdition = new Map<string, ResolvedZipAssetPack>();
    const visitDirectory = (directory: string, publicPrefix: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          const edition = this._normalizeEditionKey(entry.name);
          if (edition) {
            visitDirectory(entryPath, `${publicPrefix}/${entry.name}`);
          }
          continue;
        }
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".zip")) {
          continue;
        }

        const baseName = entry.name.replace(/\.zip$/i, "");
        const edition =
          this._normalizeEditionKey(baseName) ??
          this._normalizeEditionKey(path.basename(directory));
        if (!edition) {
          continue;
        }

        const stats = fs.statSync(entryPath);
        const current = byEdition.get(edition);
        if (current && new Date(current.modifiedAt).getTime() >= stats.mtimeMs) {
          continue;
        }

        byEdition.set(edition, {
          key: edition,
          edition,
          fileName: entry.name,
          sizeBytes: stats.size,
          storagePath: entryPath,
          publicPath: `${publicPrefix}/${entry.name}`,
          modifiedAt: stats.mtime.toISOString(),
        });
      }
    };

    visitDirectory(root, "/assets/asset_packs");

    return Array.from(byEdition.values()).sort(
      (left, right) =>
        this._editionSortIndex(left.edition) -
        this._editionSortIndex(right.edition),
    );
  }

  private _discoverActivePacks(): ResolvedAssetPack[] {
    const root = storagePath("asset_packs");
    if (!fs.existsSync(root)) {
      return [];
    }

    const discovered: ResolvedAssetPack[] = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const edition = this._normalizeEditionKey(entry.name);
      if (!edition) {
        continue;
      }

      const pack = this._discoverEditionPack(
        edition,
        entry.name,
        path.join(root, entry.name),
      );
      if (pack) {
        discovered.push(pack);
      }
    }

    discovered.sort((left, right) => {
      const editionDiff =
        this._editionSortIndex(left.edition) -
        this._editionSortIndex(right.edition);
      if (editionDiff !== 0) {
        return editionDiff;
      }
      return left.version.localeCompare(right.version);
    });

    return discovered;
  }

  private _discoverEditionPack(
    edition: string,
    folderName: string,
    editionPath: string,
  ): ResolvedAssetPack | null {
    const candidates = fs
      .readdirSync(editionPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        this._buildPackCandidate(
          edition,
          folderName,
          entry.name,
          path.join(editionPath, entry.name),
        ),
      )
      .filter((entry): entry is PackCandidate => entry !== null);

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((left, right) => {
      if (right.pageCount !== left.pageCount) {
        return right.pageCount - left.pageCount;
      }
      if (right.latestModifiedTimeMs !== left.latestModifiedTimeMs) {
        return right.latestModifiedTimeMs - left.latestModifiedTimeMs;
      }
      return right.version.localeCompare(left.version);
    });

    const [best] = candidates;
    return {
      edition: best.edition,
      folderName: best.folderName,
      version: best.version,
      pageCount: best.pageCount,
      fileExtension: best.fileExtension,
      availableImportedPages: best.availableImportedPages,
      contiguousImportedPageStart: best.contiguousImportedPageStart,
      contiguousImportedPageEnd: best.contiguousImportedPageEnd,
      sizeBytes: best.sizeBytes,
      storagePath: best.storagePath,
      publicPath: best.publicPath,
      active: true,
    };
  }

  private _buildPackCandidate(
    edition: string,
    folderName: string,
    version: string,
    versionPath: string,
  ): PackCandidate | null {
    const variants = new Map<string, ExtensionVariant>();

    for (const entry of fs.readdirSync(versionPath, { withFileTypes: true })) {
      if (!entry.isFile()) {
        continue;
      }

      const match = IMAGE_FILE_PATTERN.exec(entry.name);
      if (!match) {
        continue;
      }

      const importedPageNumber = Number(match[1]);
      if (!Number.isFinite(importedPageNumber) || importedPageNumber <= 0) {
        continue;
      }

      const extension = match[2].toLowerCase();
      const filePath = path.join(versionPath, entry.name);
      const stats = fs.statSync(filePath);
      const variant = variants.get(extension) ?? {
        extension,
        pageNumbers: new Set<number>(),
        sizeBytes: 0,
        latestModifiedTimeMs: 0,
      };

      variant.pageNumbers.add(importedPageNumber);
      variant.sizeBytes += stats.size;
      if (stats.mtimeMs > variant.latestModifiedTimeMs) {
        variant.latestModifiedTimeMs = stats.mtimeMs;
      }
      variants.set(extension, variant);
    }

    const selectedVariant = Array.from(variants.values()).sort(
      (left, right) => {
        const pageCountDiff = right.pageNumbers.size - left.pageNumbers.size;
        if (pageCountDiff !== 0) {
          return pageCountDiff;
        }
        return right.latestModifiedTimeMs - left.latestModifiedTimeMs;
      },
    )[0];

    if (!selectedVariant || selectedVariant.pageNumbers.size === 0) {
      return null;
    }

    const importedPages = Array.from(selectedVariant.pageNumbers).sort(
      (left, right) => left - right,
    );
    const contiguousStart = importedPages[0];
    const contiguousEnd = importedPages[importedPages.length - 1];
    const isContiguous = importedPages.every(
      (page, index) => page === contiguousStart + index,
    );

    return {
      edition,
      folderName,
      version,
      pageCount: importedPages.length,
      fileExtension: selectedVariant.extension,
      availableImportedPages: isContiguous ? [] : importedPages,
      contiguousImportedPageStart: isContiguous ? contiguousStart : undefined,
      contiguousImportedPageEnd: isContiguous ? contiguousEnd : undefined,
      sizeBytes: selectedVariant.sizeBytes,
      storagePath: versionPath,
      publicPath: `/assets/asset_packs/${folderName}/${version}`,
      active: true,
      latestModifiedTimeMs: selectedVariant.latestModifiedTimeMs,
    };
  }

  private _normalizeEditionKey(value: string): string | null {
    switch (value.trim().toLowerCase()) {
      case "10_line":
      case "10_lines":
        return "10_line";
      case "13_line":
      case "13_lines":
        return "13_line";
      case "14_line":
      case "14_lines":
        return "14_line";
      case "15_line":
      case "15_lines":
        return "15_line";
      case "16_line":
      case "16_lines":
        return "16_line";
      case "17_line":
      case "17_lines":
        return "17_line";
      case "kanzul_iman":
      case "kanzuliman":
        return "kanzul_iman";
      default:
        return null;
    }
  }

  private _editionSortIndex(edition: string) {
    const index = EDITION_ORDER.indexOf(
      edition as (typeof EDITION_ORDER)[number],
    );
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  }
}
