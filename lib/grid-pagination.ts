/** Pagination changes only the rendered window, never the source records or totals. */
export function gridPage(total: number, requestedPage: number, pageSize: number) {
  const size = Math.max(1, Math.floor(pageSize));
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.max(1, Math.min(pages, Math.floor(requestedPage)));
  const offset = (page - 1) * size;
  return { page, pages, size, offset, end: Math.min(total, offset + size), total };
}
