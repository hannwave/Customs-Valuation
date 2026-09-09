"use client";

import { useMemo, useState } from "react";
import {
  Card,
  Group,
  Loader,
  Stack,
  Text,
} from "@mantine/core";
import { useTranslation } from "react-i18next";

import { HsCatalogueHeader } from "@/components/hs-codes/HsCatalogueHeader";
import { HsSearchFilters } from "@/components/hs-codes/HsSearchFilters";
import { HsResultsTable } from "@/components/hs-codes/HsResultsTable";
import { HsPagination } from "@/components/hs-codes/HsPagination";
import { HsLoadingState } from "@/components/hs-codes/HsLoadingState";
import { HsEmptyState } from "@/components/hs-codes/HsEmptyState";
import { HsErrorState } from "@/components/hs-codes/HsErrorState";

import {
  useGetHsCodesQuery,
  useGetHsRevisionsQuery,
} from "@/lib/store/api/hsCodesApi";

const PAGE_SIZE = 20;

export default function HsCodesPage() {
  const { t } = useTranslation();

  /*
   * Form values.
   *
   * These values change while the user is typing.
   */
  const [codeInput, setCodeInput] = useState("");
  const [descriptionInput, setDescriptionInput] =
    useState("");

  /*
   * Applied search values.
   *
   * The API only runs with these values after
   * the user presses Search.
   */
  const [codeSearch, setCodeSearch] = useState("");
  const [descriptionSearch, setDescriptionSearch] =
    useState("");

  const [revisionId, setRevisionId] =
    useState<string | null>(null);

  const [page, setPage] = useState(1);

  /*
   * The current backend supports one `search`
   * parameter.
   *
   * Combine the two UI search fields into the
   * single backend search parameter.
   */
  const combinedSearch = useMemo(() => {
    return [codeSearch, descriptionSearch]
      .filter((value) => value.trim().length > 0)
      .join(" ")
      .trim();
  }, [codeSearch, descriptionSearch]);

  /*
   * HS codes API
   */
  const {
    data,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useGetHsCodesQuery({
    search: combinedSearch || undefined,
    revisionId: revisionId || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  /*
   * HS revisions API
   */
  const {
    data: revisions,
    isLoading: revisionsLoading,
    isError: revisionsError,
    refetch: refetchRevisions,
  } = useGetHsRevisionsQuery();

  /*
   * Convert API revisions into the format
   * required by Mantine Select.
   */
  const revisionOptions = useMemo(
    () =>
      revisions?.map((revision) => ({
        value: revision.id,
        label: revision.name,
      })) ?? [],
    [revisions],
  );

  /*
   * Calculate total pages from the API result.
   */
  const totalPages = data
    ? Math.max(
        1,
        Math.ceil(data.totalCount / PAGE_SIZE),
      )
    : 1;

  /*
   * Search button.
   */
  const handleSearch = () => {
    setCodeSearch(codeInput.trim());
    setDescriptionSearch(descriptionInput.trim());

    /*
     * Always return to page 1 when search
     * filters change.
     */
    setPage(1);
  };

  /*
   * Revision change.
   */
  const handleRevisionChange = (
    value: string | null,
  ) => {
    setRevisionId(value);

    /*
     * Always return to page 1 when the
     * revision changes.
     */
    setPage(1);
  };

  /*
   * Clear all filters.
   */
  const handleClear = () => {
    setCodeInput("");
    setDescriptionInput("");

    setCodeSearch("");
    setDescriptionSearch("");

    setRevisionId(null);
    setPage(1);
  };

  return (
    <main className="hs-catalogue-page">
      <Stack gap="xl">
        {/* Page heading */}
        <HsCatalogueHeader />

        {/* Search/filter section */}
        <Card
          withBorder
          radius="md"
          padding="lg"
        >
          <Stack gap="md">
            <div>
              <Text fw={600} size="lg">
                {t(
                  "searchFilters",
                  "Search filters",
                )}
              </Text>

              <Text
                size="sm"
                c="dimmed"
                mt={4}
              >
                {t(
                  "searchFiltersHint",
                  "Search by HS code or description and optionally select a revision.",
                )}
              </Text>
            </div>

            <HsSearchFilters
              code={codeInput}
              description={descriptionInput}
              revisionId={revisionId}
              revisions={revisionOptions}
              revisionsLoading={revisionsLoading}
              onCodeChange={setCodeInput}
              onDescriptionChange={
                setDescriptionInput
              }
              onRevisionChange={
                handleRevisionChange
              }
              onSearch={handleSearch}
              onClear={handleClear}
            />
          </Stack>
        </Card>

        {/* Revision loading error */}
        {revisionsError && (
          <HsErrorState
            onRetry={refetchRevisions}
            message={t(
              "revisionLoadError",
              "The revision list could not be loaded. Please try again.",
            )}
          />
        )}

        {/* HS API error */}
        {isError && (
          <HsErrorState
            onRetry={refetch}
            message={t(
              "error",
              "The HS codes could not be loaded. Please try again.",
            )}
          />
        )}

        {/* Initial loading */}
        {/* isLoading */ false && <HsLoadingState />}

        {/* Results */}
        {!isLoading &&
          !isError &&
          data && (
            <Stack gap="md">
              {/* Result summary */}
              <Group
                justify="space-between"
                align="center"
              >
                <div>
                  <Text
                    fw={600}
                    size="lg"
                  >
                    {t(
                      "hsResults",
                      "HS code results",
                    )}
                  </Text>

                  <Text
                    size="sm"
                    c="dimmed"
                  >
                    {data.totalCount}{" "}
                    {t(
                      "count",
                      "results",
                    )}
                  </Text>
                </div>

                {/* Shows while changing page/filter */}
                {isFetching && (
                  <Group gap="xs">
                    <Loader size="xs" />

                    <Text
                      size="sm"
                      c="dimmed"
                    >
                      {t(
                        "updating",
                        "Updating...",
                      )}
                    </Text>
                  </Group>
                )}
              </Group>

              {/* Empty state */}
              {data.items.length === 0 ? (
                <HsEmptyState />
              ) : (
                <>
                  {/* Results table */}
                  <Card
                    withBorder
                    radius="md"
                    padding={0}
                    className="hs-table-card"
                  >
                    <HsResultsTable
                      items={data.items}
                      revisions={
                        revisions ?? []
                      }
                    />
                  </Card>

                  {/* Pagination */}
                  <HsPagination
                    page={page}
                    totalPages={totalPages}
                    totalCount={
                      data.totalCount
                    }
                    disabled={isFetching}
                    onChange={setPage}
                  />
                </>
              )}
            </Stack>
          )}
      </Stack>
    </main>
  );
}