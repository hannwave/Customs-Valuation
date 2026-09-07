import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQuery } from "./baseQuery";
import type { HsCode, HsRevision, PagedResult } from "@/lib/types/customs";
export const hsCodesApi = createApi({
  reducerPath: "hsCodesApi", baseQuery,
  endpoints: (builder) => ({
    getHsCodes: builder.query<PagedResult<HsCode>, { search: string; revisionId?: string; page?: number }>({
      query: (params) => ({ url: "hs-codes", params: { ...params, pageSize: 20 } }),
    }),
    getHsRevisions: builder.query<HsRevision[], void>({ query: () => "hs-revisions" }),
  }),
});
export const { useGetHsCodesQuery, useGetHsRevisionsQuery } = hsCodesApi;
