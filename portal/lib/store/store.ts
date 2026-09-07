import { configureStore } from "@reduxjs/toolkit";
import { hsCodesApi } from "./api/hsCodesApi";
export const makeStore = () => configureStore({
  reducer: { [hsCodesApi.reducerPath]: hsCodesApi.reducer },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(hsCodesApi.middleware),
});
export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
