import { ValidationError } from './errors.js';

export interface PageRequest {
  page: number;
  size: number;
  sortField: string;
  direction: 'ASC' | 'DESC';
}

export interface PageResponse<T> {
  content: T[];
  pageNumber: number;
  pageSize: number;
  totalElements: number;
  totalPages: number;
  last: boolean;
}

export function parsePage(
  query: Record<string, unknown>,
  defaultSort: string,
  fields: string[],
  defaultDirection: 'ASC' | 'DESC' = 'DESC',
): PageRequest {
  const page = query.page === undefined ? 0 : Number(query.page);
  const size = query.size === undefined ? 20 : Number(query.size);
  const sort = query.sort === undefined ? `${defaultSort},${defaultDirection}` : String(query.sort);
  const [sortField = defaultSort, rawDirection = 'ASC'] = sort.split(',');
  const direction = rawDirection.toUpperCase();
  if (!Number.isInteger(page) || page < 0 || !Number.isInteger(size) || size < 1 || size > 100) {
    throw new ValidationError([{
      field: 'page',
      rejectedValue: query.page ?? query.size,
      message: 'Page must be non-negative and size must be between 1 and 100',
    }]);
  }
  if (!fields.includes(sortField) || !['ASC', 'DESC'].includes(direction)) {
    throw new ValidationError([{
      field: 'sort',
      rejectedValue: sort,
      message: 'Sort field or direction is not supported',
    }]);
  }
  return { page, size, sortField, direction: direction as 'ASC' | 'DESC' };
}

export function toPage<T>(items: T[], request: PageRequest, totalElements = items.length): PageResponse<T> {
  const totalPages = totalElements === 0 ? 0 : Math.ceil(totalElements / request.size);
  const content = items;
  return {
    content,
    pageNumber: request.page,
    pageSize: request.size,
    totalElements,
    totalPages,
    last: request.page >= totalPages - 1,
  };
}
