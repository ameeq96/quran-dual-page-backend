import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import { Repository } from 'typeorm';
import { MemoryCacheService } from '../common/cache/memory-cache.service';
import { ContentDataset } from '../entities/content_dataset.entity';

type SurahEntry = {
  id: number;
  nameSimple: string;
  nameComplex: string;
  nameArabic: string;
  translatedName: string;
  standardStartPage: number;
  tajScanStartPage: number;
};

type JuzEntry = {
  number: number;
  name: string;
  nameArabic: string;
  standardStartPage: number;
  tajScanStartPage: number;
};

type SearchMarkerCategory = 'ruku' | 'hizb' | 'manzil' | 'rub';

type SearchMarker = {
  id: number;
  title: string;
  subtitle: string;
  pageNumber: number;
  category: SearchMarkerCategory;
};

type SearchResult = {
  pageNumber: number;
  referencePageNumber: number;
  title: string;
  snippet: string;
  category: string;
  verseKey?: string;
};

type PageVerse = {
  verseKey: string;
  chapterId: number;
  verseNumber: number;
  translationEn?: string;
  translationUr?: string;
};

type PageInsight = {
  pageNumber: number;
  chapterIds?: number[];
  juzNumbers?: number[];
  hizbNumbers?: number[];
  rubElHizbNumbers?: number[];
  rukuNumbers?: number[];
  manzilNumbers?: number[];
  translationEn?: string;
  translationUr?: string;
  verses?: PageVerse[];
};

type ChapterSummary = {
  id: number;
  nameSimple: string;
};

type TextPageLine = {
  lineNumber: number;
  text: string;
};

type TextPage = {
  pageNumber: number;
  lines?: TextPageLine[];
};

type NavigationPayload = {
  surahs?: Array<Record<string, unknown>>;
  siparas?: Array<Record<string, unknown>>;
};

type OverridePayload = {
  surahStartPages?: Record<string, unknown>;
  siparaStartPages?: Record<string, unknown>;
};

type PageInsightsPayload = {
  pages?: Array<Record<string, unknown>>;
  chapters?: Array<Record<string, unknown>>;
};

type TextPagesPayload = {
  pages?: Array<Record<string, unknown>>;
};

const SEARCH_CACHE_TTL_MS = 300_000;
const SEARCH_RESULTS_CACHE_TTL_MS = 30_000;

@Injectable()
export class PublicSearchService {
  constructor(
    @InjectRepository(ContentDataset)
    private readonly datasetsRepo: Repository<ContentDataset>,
    private readonly cache: MemoryCacheService,
  ) {}

  async searchSurahs(query: string) {
    const cacheKey = `public-search:surahs:${query.trim().toLowerCase()}`;
    return this.cache.getOrSet(cacheKey, SEARCH_RESULTS_CACHE_TTL_MS, async () => {
      const { surahs } = await this._loadNavigationBundle();
      const trimmedQuery = query.trim().toLowerCase();
      if (!trimmedQuery) {
        return surahs;
      }

      const normalizedQuery = this._normalizeSearchText(trimmedQuery);
      const scored: Array<{ item: SurahEntry; score: number }> = [];

      for (const surah of surahs) {
        const normalizedFields = [
          this._normalizeSearchText(surah.nameSimple),
          this._normalizeSearchText(surah.nameComplex),
          this._normalizeSearchText(surah.translatedName),
          this._normalizeSearchText(surah.nameArabic),
        ];

        let score: number | null = null;
        if (surah.id.toString() === trimmedQuery) {
          score = 0;
        } else if (normalizedFields.some((value) => value === normalizedQuery)) {
          score = 1;
        } else if (
          normalizedFields.some((value) => value.startsWith(normalizedQuery))
        ) {
          score = 2;
        } else if (
          normalizedFields.some((value) => value.includes(normalizedQuery))
        ) {
          score = 3;
        }

        if (score !== null) {
          scored.push({ item: surah, score });
        }
      }

      scored.sort((left, right) => {
        const scoreCompare = left.score - right.score;
        if (scoreCompare !== 0) {
          return scoreCompare;
        }
        return left.item.id - right.item.id;
      });

      return scored.map((entry) => entry.item);
    });
  }

  async searchJuzs(query: string) {
    const cacheKey = `public-search:juzs:${query.trim().toLowerCase()}`;
    return this.cache.getOrSet(cacheKey, SEARCH_RESULTS_CACHE_TTL_MS, async () => {
      const { juzs } = await this._loadNavigationBundle();
      const trimmedQuery = query.trim().toLowerCase();
      if (!trimmedQuery) {
        return juzs;
      }

      const normalizedQuery = this._normalizeSearchText(trimmedQuery);
      const scored: Array<{ item: JuzEntry; score: number }> = [];

      for (const juz of juzs) {
        const normalizedName = this._normalizeSearchText(juz.name);
        const normalizedArabic = this._normalizeSearchText(juz.nameArabic);
        const normalizedLabel = this._normalizeSearchText(`sipara ${juz.number}`);

        let score: number | null = null;
        if (juz.number.toString() === trimmedQuery) {
          score = 0;
        } else if (
          normalizedName === normalizedQuery ||
          normalizedArabic === normalizedQuery ||
          normalizedLabel === normalizedQuery
        ) {
          score = 1;
        } else if (
          normalizedName.startsWith(normalizedQuery) ||
          normalizedArabic.startsWith(normalizedQuery) ||
          normalizedLabel.startsWith(normalizedQuery)
        ) {
          score = 2;
        } else if (
          normalizedName.includes(normalizedQuery) ||
          normalizedArabic.includes(normalizedQuery) ||
          normalizedLabel.includes(normalizedQuery)
        ) {
          score = 3;
        }

        if (score !== null) {
          scored.push({ item: juz, score });
        }
      }

      scored.sort((left, right) => {
        const scoreCompare = left.score - right.score;
        if (scoreCompare !== 0) {
          return scoreCompare;
        }
        return left.item.number - right.item.number;
      });

      return scored.map((entry) => entry.item);
    });
  }

  async searchMarkers(category: string, query: string) {
    const normalizedCategory = this._normalizeMarkerCategory(category);
    const cacheKey = `public-search:markers:${normalizedCategory}:${query
      .trim()
      .toLowerCase()}`;

    return this.cache.getOrSet(cacheKey, SEARCH_RESULTS_CACHE_TTL_MS, async () => {
      const markers = await this._loadMarkersForCategory(normalizedCategory);
      const trimmedQuery = query.trim().toLowerCase();
      if (!trimmedQuery) {
        return markers;
      }

      return markers.filter((marker) => {
        return (
          marker.id.toString() === trimmedQuery ||
          marker.pageNumber.toString() === trimmedQuery ||
          marker.title.toLowerCase().includes(trimmedQuery) ||
          marker.subtitle.toLowerCase().includes(trimmedQuery)
        );
      });
    });
  }

  async searchAyahs(query: string, limit = 40) {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return [] as SearchResult[];
    }

    const cacheKey = `public-search:ayahs:${trimmedQuery.toLowerCase()}:${limit}`;
    return this.cache.getOrSet(cacheKey, SEARCH_RESULTS_CACHE_TTL_MS, async () => {
      const { pages, chapters } = await this._loadPageInsightsBundle();
      const lowerQuery = trimmedQuery.toLowerCase();
      const results: SearchResult[] = [];

      for (const insight of pages) {
        if (results.length >= limit) {
          break;
        }

        const verses = insight.verses ?? [];
        for (const verse of verses) {
          if (results.length >= limit) {
            break;
          }

          const title = this._ayahTitleForVerse(
            chapters.get(verse.chapterId),
            verse.chapterId,
            verse.verseNumber,
            insight.pageNumber,
          );

          if (verse.verseKey.toLowerCase() === lowerQuery) {
            results.push({
              pageNumber: insight.pageNumber,
              referencePageNumber: insight.pageNumber,
              title,
              snippet: verse.verseKey,
              category: 'Ayah',
              verseKey: verse.verseKey,
            });
            continue;
          }

          const englishSnippet = this._matchingTranslationSnippet(
            verse.translationEn ?? '',
            lowerQuery,
          );
          if (englishSnippet) {
            results.push({
              pageNumber: insight.pageNumber,
              referencePageNumber: insight.pageNumber,
              title,
              snippet: englishSnippet,
              category: 'Ayah translation',
              verseKey: verse.verseKey,
            });
            continue;
          }

          const urduSnippet = this._matchingTranslationSnippet(
            verse.translationUr ?? '',
            lowerQuery,
          );
          if (urduSnippet) {
            results.push({
              pageNumber: insight.pageNumber,
              referencePageNumber: insight.pageNumber,
              title,
              snippet: urduSnippet,
              category: 'Ayah translation',
              verseKey: verse.verseKey,
            });
          }
        }
      }

      return results;
    });
  }

  async searchText(query: string, limit = 40) {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return [] as SearchResult[];
    }

    const cacheKey = `public-search:text:${trimmedQuery.toLowerCase()}:${limit}`;
    return this.cache.getOrSet(cacheKey, SEARCH_RESULTS_CACHE_TTL_MS, async () => {
      const [{ pages, chapters }, textPages] = await Promise.all([
        this._loadPageInsightsBundle(),
        this._loadTextPages(),
      ]);

      const lowerQuery = trimmedQuery.toLowerCase();
      const results: SearchResult[] = [];

      for (const pageData of textPages) {
        if (results.length >= limit) {
          break;
        }

        const insight = pages.find((page) => page.pageNumber === pageData.pageNumber);
        const chapter = this._primaryChapterForInsight(insight, chapters);
        const title = chapter
          ? `${chapter.nameSimple} • Page ${pageData.pageNumber}`
          : `Page ${pageData.pageNumber}`;

        const verseMatch = this._findVerseKeyMatch(insight, lowerQuery);
        if (verseMatch) {
          results.push({
            pageNumber: pageData.pageNumber,
            referencePageNumber: pageData.pageNumber,
            title,
            snippet: `Verse ${verseMatch.verseKey}`,
            category: 'Ayah',
            verseKey: verseMatch.verseKey,
          });
          continue;
        }

        const verseTranslationMatches = this._findVerseTranslationMatches(
          insight,
          lowerQuery,
          pageData.pageNumber,
          title,
          limit - results.length,
        );
        if (verseTranslationMatches.length > 0) {
          results.push(...verseTranslationMatches);
          continue;
        }

        const arabicSnippet = this._firstMatchingArabicSnippet(
          pageData,
          trimmedQuery,
        );
        if (arabicSnippet) {
          results.push({
            pageNumber: pageData.pageNumber,
            referencePageNumber: pageData.pageNumber,
            title,
            snippet: arabicSnippet,
            category: 'Arabic text',
          });
          continue;
        }

        const englishSnippet = this._matchingTranslationSnippet(
          insight?.translationEn ?? '',
          lowerQuery,
        );
        if (englishSnippet) {
          results.push({
            pageNumber: pageData.pageNumber,
            referencePageNumber: pageData.pageNumber,
            title,
            snippet: englishSnippet,
            category: 'English translation',
          });
          continue;
        }

        const urduSnippet = this._matchingTranslationSnippet(
          insight?.translationUr ?? '',
          lowerQuery,
        );
        if (urduSnippet) {
          results.push({
            pageNumber: pageData.pageNumber,
            referencePageNumber: pageData.pageNumber,
            title,
            snippet: urduSnippet,
            category: 'Urdu translation',
          });
        }
      }

      return results;
    });
  }

  private async _loadNavigationBundle() {
    return this.cache.getOrSet('public-search:navigation-bundle', SEARCH_CACHE_TTL_MS, async () => {
      const payload = await this._loadDatasetPayload<NavigationPayload>('navigation_index');
      const overridePayload = await this._loadDatasetPayload<OverridePayload>(
        'taj_navigation_overrides',
      );
      const surahOverrides = this._parseOverrideMap(overridePayload.surahStartPages);
      const juzOverrides = this._parseOverrideMap(overridePayload.siparaStartPages);

      const surahs = (payload.surahs ?? []).map((item) => ({
        id: Number(item.id ?? 0),
        nameSimple: String(item.nameSimple ?? ''),
        nameComplex: String(item.nameComplex ?? ''),
        nameArabic: String(item.nameArabic ?? ''),
        translatedName: String(item.translatedName ?? ''),
        standardStartPage: Number(item.standardStartPage ?? 1),
        tajScanStartPage: surahOverrides.get(Number(item.id ?? 0)) ??
            Number(item.tajScanStartPage ?? item.standardStartPage ?? 1),
      }));

      const juzs = (payload.siparas ?? []).map((item) => ({
        number: Number(item.number ?? 0),
        name: String(item.name ?? ''),
        nameArabic: String(item.nameArabic ?? ''),
        standardStartPage: Number(item.standardStartPage ?? 1),
        tajScanStartPage: juzOverrides.get(Number(item.number ?? 0)) ??
            Number(item.tajScanStartPage ?? item.standardStartPage ?? 1),
      }));

      return { surahs, juzs };
    });
  }

  private async _loadPageInsightsBundle() {
    return this.cache.getOrSet(
      'public-search:page-insights-bundle',
      SEARCH_CACHE_TTL_MS,
      async () => {
        const payload =
            await this._loadDatasetPayload<PageInsightsPayload>('page_insights');
        const pages = (payload.pages ?? []).map((entry) => ({
          pageNumber: Number(entry.pageNumber ?? 0),
          chapterIds: Array.isArray(entry.chapterIds)
              ? entry.chapterIds.map((value) => Number(value)).filter((value) => value > 0)
              : [],
          juzNumbers: Array.isArray(entry.juzNumbers)
              ? entry.juzNumbers.map((value) => Number(value)).filter((value) => value > 0)
              : [],
          hizbNumbers: Array.isArray(entry.hizbNumbers)
              ? entry.hizbNumbers.map((value) => Number(value)).filter((value) => value > 0)
              : [],
          rubElHizbNumbers: Array.isArray(entry.rubElHizbNumbers)
              ? entry.rubElHizbNumbers
                  .map((value) => Number(value))
                  .filter((value) => value > 0)
              : [],
          rukuNumbers: Array.isArray(entry.rukuNumbers)
              ? entry.rukuNumbers.map((value) => Number(value)).filter((value) => value > 0)
              : [],
          manzilNumbers: Array.isArray(entry.manzilNumbers)
              ? entry.manzilNumbers.map((value) => Number(value)).filter((value) => value > 0)
              : [],
          translationEn: String(entry.translationEn ?? ''),
          translationUr: String(entry.translationUr ?? ''),
          verses: Array.isArray(entry.verses)
              ? entry.verses.map((verse) => ({
                  verseKey: String((verse as Record<string, unknown>).verseKey ?? ''),
                  chapterId: Number((verse as Record<string, unknown>).chapterId ?? 0),
                  verseNumber: Number((verse as Record<string, unknown>).verseNumber ?? 0),
                  translationEn: String(
                    (verse as Record<string, unknown>).translationEn ?? '',
                  ),
                  translationUr: String(
                    (verse as Record<string, unknown>).translationUr ?? '',
                  ),
                }))
              : [],
        }));

        const chapters = new Map<number, ChapterSummary>(
          (payload.chapters ?? []).map((entry) => [
            Number(entry.id ?? 0),
            {
              id: Number(entry.id ?? 0),
              nameSimple: String(entry.nameSimple ?? ''),
            },
          ]),
        );

        return { pages, chapters };
      },
    );
  }

  private async _loadTextPages() {
    return this.cache.getOrSet('public-search:text-pages', SEARCH_CACHE_TTL_MS, async () => {
      const payload = await this._loadDatasetPayload<TextPagesPayload>('text_pages');
      return (payload.pages ?? []).map((entry) => ({
        pageNumber: Number(entry.pageNumber ?? 0),
        lines: Array.isArray(entry.lines)
            ? entry.lines.map((line) => ({
                lineNumber: Number((line as Record<string, unknown>).lineNumber ?? 0),
                text: String((line as Record<string, unknown>).text ?? ''),
              }))
            : [],
      }));
    });
  }

  private async _loadMarkersForCategory(category: SearchMarkerCategory) {
    return this.cache.getOrSet(
      `public-search:markers-base:${category}`,
      SEARCH_CACHE_TTL_MS,
      async () => {
        const { pages, chapters } = await this._loadPageInsightsBundle();
        const markersById = new Map<number, SearchMarker>();

        for (const page of pages) {
          const chapter = this._primaryChapterForInsight(page, chapters);
          for (const value of this._markerValuesForPage(page, category)) {
            if (markersById.has(value)) {
              continue;
            }
            markersById.set(value, {
              id: value,
              title: `${this._markerTitlePrefix(category)} ${value}`,
              subtitle: chapter?.nameSimple || `Page ${page.pageNumber}`,
              pageNumber: page.pageNumber,
              category,
            });
          }
        }

        return Array.from(markersById.values()).sort((left, right) => left.id - right.id);
      },
    );
  }

  private async _loadDatasetPayload<T>(key: string): Promise<T> {
    return this.cache.getOrSet(`public-search:dataset:${key}`, SEARCH_CACHE_TTL_MS, async () => {
      const dataset = await this.datasetsRepo.findOne({
        where: { key, active: true },
        select: { storagePath: true, version: true },
      });

      if (!dataset?.storagePath) {
        throw new NotFoundException(`Active dataset "${key}" was not found.`);
      }
      if (!fs.existsSync(dataset.storagePath)) {
        throw new NotFoundException(`Dataset file for "${key}" is missing.`);
      }

      const rawJson = fs.readFileSync(dataset.storagePath, 'utf8');
      return JSON.parse(rawJson) as T;
    });
  }

  private _parseOverrideMap(rawValue: Record<string, unknown> | undefined) {
    const parsed = new Map<number, number>();
    if (!rawValue) {
      return parsed;
    }

    for (const [rawKey, rawPage] of Object.entries(rawValue)) {
      const key = Number(rawKey);
      const page = Number(rawPage);
      if (Number.isInteger(key) && Number.isInteger(page) && page > 0) {
        parsed.set(key, page);
      }
    }

    return parsed;
  }

  private _normalizeMarkerCategory(value: string): SearchMarkerCategory {
    const normalized = value.trim().toLowerCase();
    switch (normalized) {
      case 'ruku':
      case 'hizb':
      case 'manzil':
      case 'rub':
        return normalized;
      default:
        throw new BadRequestException('Invalid marker category.');
    }
  }

  private _normalizeSearchText(value: string) {
    return value
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
      .replace(/\u0622/g, '\u0627')
      .replace(/\u0623/g, '\u0627')
      .replace(/\u0625/g, '\u0627')
      .replace(/\u0671/g, '\u0627')
      .replace(/\u0649/g, '\u064A')
      .replace(/\u0629/g, '\u0647')
      .replace(/\u0624/g, '\u0648')
      .replace(/\u0626/g, '\u064A')
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF]+/g, '');
  }

  private _primaryChapterForInsight(
    insight: PageInsight | undefined,
    chapters: Map<number, ChapterSummary>,
  ) {
    if (!insight) {
      return null;
    }

    const verseChapterId = (insight.verses ?? []).find(
      (verse) => verse.verseNumber === 1 && verse.chapterId > 0,
    )?.chapterId;
    const chapterId = verseChapterId ?? insight.chapterIds?.[0];
    if (!chapterId) {
      return null;
    }
    return chapters.get(chapterId) ?? null;
  }

  private _markerValuesForPage(page: PageInsight, category: SearchMarkerCategory) {
    switch (category) {
      case 'ruku':
        return page.rukuNumbers ?? [];
      case 'hizb':
        return page.hizbNumbers ?? [];
      case 'manzil':
        return page.manzilNumbers ?? [];
      case 'rub':
        return page.rubElHizbNumbers ?? [];
    }
  }

  private _markerTitlePrefix(category: SearchMarkerCategory) {
    switch (category) {
      case 'ruku':
        return 'Ruku';
      case 'hizb':
        return 'Hizb';
      case 'manzil':
        return 'Manzil';
      case 'rub':
        return 'Rub';
    }
  }

  private _matchingTranslationSnippet(text: string, lowerQuery: string) {
    if (!text || !text.toLowerCase().includes(lowerQuery)) {
      return null;
    }
    const lowerText = text.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);
    const start = Math.max(0, index - 48);
    const end = Math.min(text.length, index + lowerQuery.length + 72);
    const prefix = start > 0 ? '...' : '';
    const suffix = end < text.length ? '...' : '';
    return `${prefix}${text.substring(start, end).trim()}${suffix}`;
  }

  private _firstMatchingArabicSnippet(pageData: TextPage, query: string) {
    for (const line of pageData.lines ?? []) {
      const text = line.text.trim();
      if (text.includes(query)) {
        return text;
      }
    }
    return null;
  }

  private _findVerseKeyMatch(insight: PageInsight | undefined, lowerQuery: string) {
    if (!insight) {
      return null;
    }

    for (const verse of insight.verses ?? []) {
      if (verse.verseKey.toLowerCase() === lowerQuery) {
        return verse;
      }
    }
    return null;
  }

  private _findVerseTranslationMatches(
    insight: PageInsight | undefined,
    lowerQuery: string,
    pageNumber: number,
    title: string,
    limit: number,
  ) {
    if (!insight || limit <= 0) {
      return [] as SearchResult[];
    }

    const matches: SearchResult[] = [];
    for (const verse of insight.verses ?? []) {
      if (matches.length >= limit) {
        break;
      }

      const englishSnippet = this._matchingTranslationSnippet(
        verse.translationEn ?? '',
        lowerQuery,
      );
      if (englishSnippet) {
        matches.push({
          pageNumber,
          referencePageNumber: pageNumber,
          title,
          snippet: `${verse.verseKey} - ${englishSnippet}`,
          category: 'Ayah translation',
          verseKey: verse.verseKey,
        });
        continue;
      }

      const urduSnippet = this._matchingTranslationSnippet(
        verse.translationUr ?? '',
        lowerQuery,
      );
      if (urduSnippet) {
        matches.push({
          pageNumber,
          referencePageNumber: pageNumber,
          title,
          snippet: `${verse.verseKey} - ${urduSnippet}`,
          category: 'Ayah translation',
          verseKey: verse.verseKey,
        });
      }
    }

    return matches;
  }

  private _ayahTitleForVerse(
    chapter: ChapterSummary | undefined,
    chapterId: number,
    verseNumber: number,
    pageNumber: number,
  ) {
    if (!chapter) {
      return `${chapterId}:${verseNumber} - Page ${pageNumber}`;
    }
    return `${chapter.id}:${verseNumber} - ${chapter.nameSimple}`;
  }
}
