import { fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type {
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
} from "@reduxjs/toolkit/query";
import {
  getSessionAccessToken,
  setSessionAccessToken,
} from "@/lib/auth/session";

const authenticatedBaseQuery = fetchBaseQuery({
  baseUrl: process.env.NEXT_PUBLIC_CUSTOMS_API_URL ?? "http://localhost:5080/api/",
  prepareHeaders: (headers) => {
    const token = getSessionAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return headers;
  },
});

export const baseQuery: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const result = await authenticatedBaseQuery(args, api, extraOptions);

  if (
    result.error?.status === 401 &&
    typeof window !== "undefined" &&
    window.location.pathname !== "/login"
  ) {
    setSessionAccessToken(null);
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  }

  return result;
};
