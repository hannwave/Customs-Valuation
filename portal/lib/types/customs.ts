export type PricePool = "International" | "Local" | "HistoricalCustoms";
export interface HsCode { id: string; revisionId: string; code: string; descriptionEn: string; descriptionAm: string | null }
export interface HsRevision { id: string; name: string; number: number; effectiveDate: string; endDate: string | null; status: string }
export interface PagedResult<T> { items: T[]; totalCount: number; page: number; pageSize: number }
