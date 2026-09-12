import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQuery } from "./baseQuery";
import type {
  HsCode,
  HsRevision,
  PagedResult,
} from "@/lib/types/customs";

interface GetHsCodesParams {
  search?: string;
  revisionId?: string;
  page?: number;
  pageSize?: number;
}

export const hsCodesApi = createApi({
  reducerPath: "hsCodesApi",
  baseQuery,

  endpoints: (builder) => ({
    getHsCodes: builder.query<PagedResult<HsCode>, GetHsCodesParams>({
      query: ({
        search,
        revisionId,
        page = 1,
        pageSize = 20,
      }) => ({
        url: "hs-codes",
        params: {
          ...(search ? { search } : {}),
          ...(revisionId ? { revisionId } : {}),
          page,
          pageSize,
        },
      }),
    }),

    getHsCode: builder.query<HsCode, string>({
      query: (id) => `hs-codes/${id}`,
    }),

    getHsRevisions: builder.query<HsRevision[], void>({
      query: () => "hs-revisions",
    }),
  }),
});

export const {
  useGetHsCodesQuery,
  useGetHsCodeQuery,
  useGetHsRevisionsQuery,
} = hsCodesApi;