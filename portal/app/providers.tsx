"use client";
import { useState } from "react";
import { Provider } from "react-redux";
import { MantineProvider } from "@mantine/core";
import { I18nextProvider } from "react-i18next";
import { makeStore } from "@/lib/store/store";
import { createI18n } from "@/lib/i18n/client";
export default function Providers({ children }: { children: React.ReactNode }) {
  const [store] = useState(makeStore);
  const [i18n] = useState(createI18n);
  return <Provider store={store}><I18nextProvider i18n={i18n}><MantineProvider>{children}</MantineProvider></I18nextProvider></Provider>;
}
