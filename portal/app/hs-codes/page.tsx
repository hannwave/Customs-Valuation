"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Container,
  Stack,
} from "@mantine/core";
import { useTranslation } from "react-i18next";

import {
  useGetHsCodesQuery,
  useGetHsRevisionsQuery,
} from "@/lib/store/api/hsCodesApi";

import { HsCatalogueHeader } from "@/components/hs-codes/HsCatalogueHeader";
import { HsSearchFilters } from "@/components/hs-codes/HsSearchFilters";
import { HsResultsTable } from "@/components/hs-codes/HsResultsTable";
import { HsPagination } from "@/components/hs-codes/HsPagination";
import { HsLoadingState } from "@/components/hs-codes/HsLoadingState";
import { HsEmptyState } from "@/components/hs-codes/HsEmptyState";
import { HsErrorState } from "@/components/hs-codes/HsErrorState";
import { HsCodeDetailsModal } from "@/components/hs-codes/HsCodeDetailsModal";

const PAGE_SIZE = 10;
const FORCE_LOADING = false;

export default function HsCodesPage() {
  const { t } = useTranslation();

  const [codeInput, setCodeInput] = useState("");
  const [descriptionInput, setDescriptionInput] =
    useState("");

  const [codeSearch, setCodeSearch] = useState("");
  const [descriptionSearch, setDescriptionSearch] =
    useState("");

  const [revisionId, setRevisionId] =
    useState<string | null>(null);

  const [page, setPage] = useState(1);

  /*
   * Selected HS code for the details modal.
   *
   * null = modal closed
   * string = modal opened for that HS code
   */
  const [selectedHsCodeId, setSelectedHsCodeId] =
    useState<string | null>(null);

  const combinedSearch = useMemo(() => {
    return [codeSearch, descriptionSearch]
      .filter(
        (value) => value.trim().length > 0,
      )
      .join(" ")
      .trim();
  }, [codeSearch, descriptionSearch]);

  const hasActiveFilters =
    codeSearch.trim().length > 0 ||
    descriptionSearch.trim().length > 0 ||
    revisionId !== null;

  const {
    data,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useGetHsCodesQuery({
    search:
      combinedSearch || undefined,
    revisionId:
      revisionId || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const {
    data: revisions,
    isLoading: revisionsLoading,
    isFetching: revisionsFetching,
    isError: revisionsError,
    refetch: refetchRevisions,
  } = useGetHsRevisionsQuery();

  const revisionOptions = useMemo(
    () =>
      (revisions ?? []).map(
        (revision) => ({
          value: revision.id,
          label: revision.name,
        }),
      ),
    [revisions],
  );

  const handleSearch = () => {
    setCodeSearch(codeInput.trim());
    setDescriptionSearch(
      descriptionInput.trim(),
    );
    setPage(1);
  };

  const handleRevisionChange = (
    value: string | null,
  ) => {
    setRevisionId(value);
    setPage(1);
  };

  const handleClear = () => {
    setCodeInput("");
    setDescriptionInput("");
    setCodeSearch("");
    setDescriptionSearch("");
    setRevisionId(null);
    setPage(1);
  };

  const handleOpenDetails = (id: string) => {
    setSelectedHsCodeId(id);
  };

  const handleCloseDetails = () => {
    setSelectedHsCodeId(null);
  };

  const totalCount =
    data?.totalCount ?? 0;

  const totalPages = Math.max(
    1,
    Math.ceil(
      totalCount / PAGE_SIZE,
    ),
  );

  useEffect(() => {
    if (
      !isFetching &&
      page > totalPages
    ) {
      setPage(totalPages);
    }
  }, [
    page,
    totalPages,
    isFetching,
  ]);

  const handleRetry = () => {
    refetch();
    refetchRevisions();
  };

  const isInitialLoading =
    FORCE_LOADING ||
    isLoading ||
    revisionsLoading;

  const isUpdating =
    isFetching ||
    revisionsFetching;

  const items = data?.items ?? [];

  return (
    <Box
      mih="100%"
      w="100%"
      bg="gray.0"
      py={{
        base: "md",
        sm: "xl",
      }}
      style={{
        overflowX: "hidden",
      }}
    >
      <Container
        size="xl"
        px={{
          base: "md",
          sm: "lg",
          md: "xl",
        }}
        style={{
          minWidth: 0,
        }}
      >
        <Stack gap="xl">
          <HsCatalogueHeader />

          <HsSearchFilters
            code={codeInput}
            description={
              descriptionInput
            }
            revisionId={revisionId}
            revisions={
              revisionOptions
            }
            revisionsLoading={
              revisionsLoading ||
              revisionsFetching
            }
            hasActiveFilters={
              hasActiveFilters
            }
            onCodeChange={
              setCodeInput
            }
            onDescriptionChange={
              setDescriptionInput
            }
            onRevisionChange={
              handleRevisionChange
            }
            onSearch={
              handleSearch
            }
            onClear={
              handleClear
            }
          />

          {isInitialLoading && (
            <HsLoadingState />
          )}

          {!isInitialLoading &&
            (
              isError ||
              revisionsError
            ) && (
              <HsErrorState
                onRetry={
                  handleRetry
                }
                message={t(
                  "error",
                  "The HS codes could not be loaded. Please try again.",
                )}
              />
            )}

          {!isInitialLoading &&
            !isError &&
            !revisionsError &&
            data && (
              <>
                {items.length === 0 ? (
                  <HsEmptyState />
                ) : (
                  <Box
                    style={{
                      position:
                        "relative",
                      minWidth: 0,
                    }}
                  >
                    <Box
                      style={{
                        opacity:
                          isUpdating
                            ? 0.65
                            : 1,
                        transition:
                          "opacity 150ms ease",
                      }}
                    >
                      <HsResultsTable
                        items={items}
                        revisions={
                          revisions ?? []
                        }
                        onViewDetails={
                          handleOpenDetails
                        }
                      />
                    </Box>

                    <HsPagination
                      page={page}
                      totalPages={
                        totalPages
                      }
                      totalCount={
                        totalCount
                      }
                      pageSize={
                        PAGE_SIZE
                      }
                      disabled={
                        isUpdating
                      }
                      onChange={
                        setPage
                      }
                    />
                  </Box>
                )}
              </>
            )}
        </Stack>
      </Container>

      <HsCodeDetailsModal
        hsCodeId={
          selectedHsCodeId
        }
        opened={
          selectedHsCodeId !== null
        }
        onClose={
          handleCloseDetails
        }
      />
    </Box>
  );
}