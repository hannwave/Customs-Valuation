"use client";
import { useState } from "react";
import { Provider } from "react-redux";
import { MantineProvider, createTheme, Button, Paper, TextInput, Select, NumberInput, PasswordInput, Textarea } from "@mantine/core";
import { I18nextProvider } from "react-i18next";
import { makeStore } from "@/lib/store/store";
import { createI18n } from "@/lib/i18n/client";
const theme = createTheme({
  primaryColor: "blue",
  primaryShade: 7,
  colors: { blue: ["#eef5fc", "#e0ecfa", "#bfd7f1", "#94bbe5", "#6b9ed6", "#4485c7", "#226db7", "#0d5eae", "#134e8c", "#102a56"] },
  fontFamily: '"Segoe UI", "Noto Sans Ethiopic", Arial, sans-serif',
  headings: { fontFamily: '"Segoe UI", "Noto Sans Ethiopic", Arial, sans-serif', fontWeight: "650" },
  defaultRadius: "md",
  radius: { xs: "4px", sm: "6px", md: "9px", lg: "16px", xl: "20px" },
  shadows: { xs: "0 3px 12px #102a5605", sm: "0 5px 20px #102a5608" },
  components: {
    Button: Button.extend({ defaultProps: { radius: "md" } }),
    Paper: Paper.extend({ defaultProps: { radius: "lg" } }),
    TextInput: TextInput.extend({ defaultProps: { size: "md" } }),
    Select: Select.extend({ defaultProps: { size: "md" } }),
    NumberInput: NumberInput.extend({ defaultProps: { size: "md" } }),
    PasswordInput: PasswordInput.extend({ defaultProps: { size: "md" } }),
    Textarea: Textarea.extend({ defaultProps: { size: "md" } }),
  },
});
export default function Providers({ children }: { children: React.ReactNode }) {
  const [store] = useState(makeStore);
  const [i18n] = useState(createI18n);
  return <Provider store={store}><I18nextProvider i18n={i18n}><MantineProvider theme={theme}>{children}</MantineProvider></I18nextProvider></Provider>;
}
