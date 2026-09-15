"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { Menu } from "@mantine/core";
import { useDemoSession } from "@/lib/auth/DemoSessionProvider";
import "./app-layout.css";

const links = [["/", "dashboard"], ["/hs-codes", "hsCodes"], ["/international-prices", "international"],
  ["/local-prices", "local"], ["/historical-customs-prices", "historical"], ["/analytics", "analytics"],
  ["/valuation-decisions", "decisions"], ["/integrations", "integrations"], ["/reports", "reports"],
  ["/administration", "administration"], ["/audit", "audit"]];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation(); const pathname = usePathname();
  const router = useRouter();
  const { ready, signedIn, signOut } = useDemoSession();
  const publicPage = pathname === "/register" || pathname === "/sign-in";

  useEffect(() => { document.documentElement.lang = i18n.language; }, [i18n.language]);

  useEffect(() => {
    if (ready && !signedIn && !publicPage) router.replace("/register");
  }, [ready, signedIn, publicPage, router]);

  if (publicPage) return <>{children}</>;
  if (!ready || !signedIn) return <div className="access-loading" role="status">{t("auth.opening")}</div>;

  return <div className="workspace"><aside><div className="brand">SES <span>CUSTOMS</span></div><p className="nav-label">{t("subtitle")}</p>
    <nav aria-label={t("title")}>{links.map(([href, key]) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>{t(key)}</Link>)}</nav>
    <p className="sidebar-note">{t("phase")}</p></aside><div className="content"><header>
      <span>{t("title")}</span>

      <div className="header-actions">
        <label>
          {t("language")}
          <select
            value={i18n.language}
            onChange={(e) => void i18n.changeLanguage(e.target.value)}
          >
            <option value="en">English</option>
            <option value="am">አማርኛ</option>
          </select>
        </label>

        <Menu position="bottom-end" shadow="md" width={210}>
          <Menu.Target>
            <button type="button" className="profile">
              <div className="profile-avatar">K</div>

              <div className="profile-info">
                <strong>Kal'ab</strong>
                <span>Admin</span>
              </div>

              <span className="profile-arrow">⌄</span>
            </button>
          </Menu.Target>

          <Menu.Dropdown>
            <Menu.Item>Profile</Menu.Item>
            <Menu.Item>Settings</Menu.Item>
            <Menu.Divider />
            <Menu.Item color="red" onClick={() => void signOut()}>
              Logout
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>
    </header>

    <div className="demo" role="note">{t("auth.demoSession")} · {t("demo")}</div><main>{children}</main></div></div>;
}