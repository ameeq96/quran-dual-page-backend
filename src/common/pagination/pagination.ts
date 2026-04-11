export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

export type PaginationMeta = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type PaginatedResponse<T> = {
  items: T[];
  meta: PaginationMeta;
};

export function normalizePagination(
  rawPage?: number | string,
  rawPageSize?: number | string,
) {
  const parsedPage = Number(rawPage);
  const parsedPageSize = Number(rawPageSize);

  const page =
    Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : DEFAULT_PAGE;
  const pageSize =
    Number.isInteger(parsedPageSize) && parsedPageSize > 0
      ? Math.min(parsedPageSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export function buildPaginatedResponse<T>(
  items: T[],
  totalItems: number,
  page: number,
  pageSize: number,
): PaginatedResponse<T> {
  return {
    items,
    meta: {
      page,
      pageSize,
      totalItems,
      totalPages: totalItems === 0 ? 1 : Math.ceil(totalItems / pageSize),
    },
  };
}
