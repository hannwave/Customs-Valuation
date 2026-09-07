import { fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { getSessionAccessToken } from "@/lib/auth/session";
export const baseQuery = fetchBaseQuery({
  baseUrl: process.env.NEXT_PUBLIC_CUSTOMS_API_URL ?? "http://localhost:5080/api/",
  prepareHeaders: (headers) => {
    const token = getSessionAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return headers;
  },
});
