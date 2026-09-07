"use client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useGetHsCodesQuery, useGetHsRevisionsQuery } from "@/lib/store/api/hsCodesApi";
export default function HsCodesPage() {
  const { t, i18n } = useTranslation();
  const [input,setInput] = useState(""); const [search,setSearch] = useState("");
  const [revisionId,setRevisionId] = useState(""); const [page,setPage] = useState(1);
  const result = useGetHsCodesQuery({ search, revisionId: revisionId || undefined, page });
  const revisions = useGetHsRevisionsQuery();
  return <><h1>{t("hsCodes")}</h1><form className="filters" onSubmit={e => {e.preventDefault(); setSearch(input); setPage(1);}}>
    <label>{t("search")}<input value={input} maxLength={100} onChange={e => setInput(e.target.value)} /></label>
    <label>{t("revision")}<select value={revisionId} onChange={e => {setRevisionId(e.target.value); setPage(1);}}><option value="">{t("allRevisions")}</option>
      {revisions.data?.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label><button type="submit">{t("searchButton")}</button></form>
    {result.isFetching && <p role="status">{t("loading")}</p>}
    {(result.isError || revisions.isError) && <p role="alert">{t("error")}</p>}
    {!result.isFetching && !result.isError && result.data && <><div className="table-wrap"><table><thead><tr><th>{t("code")}</th><th>{t("description")}</th><th>{t("revision")}</th></tr></thead>
    <tbody>{result.data.items.map(x => <tr key={x.id}><td><strong>{x.code}</strong></td><td>{i18n.language === "am" ? x.descriptionAm || x.descriptionEn : x.descriptionEn}</td><td>{revisions.data?.find(r => r.id === x.revisionId)?.name ?? x.revisionId}</td></tr>)}</tbody></table></div>
    {result.data.items.length === 0 && <p>{t("empty")}</p>}<div className="pagination"><button disabled={page === 1} onClick={() => setPage(p => p - 1)}>{t("previous")}</button><span>{t("page")} {page} · {result.data.totalCount} {t("count")}</span><button disabled={page * 20 >= result.data.totalCount} onClick={() => setPage(p => p + 1)}>{t("next")}</button></div></>}
    </>;
}
