"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Alert,
  Anchor,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { useTranslation } from "react-i18next";

import { HsCodeDetails } from "@/components/hs-codes/HsCodeDetails";
import { HsLoadingState } from "@/components/hs-codes/HsLoadingState";

import {
  useGetHsCodeQuery,
  useGetHsRevisionsQuery,
} from "@/lib/store/api/hsCodesApi";

const FORCE_LOADING = false;
const FORCE_ERROR = false;

export default function HsCodeDetailPage() {
  const { t } = useTranslation();
  const params = useParams();

  const id =
    typeof params.id === "string"
      ? params.id
      : "";

  const {
    data: hsCode,
    isLoading,
    isError,
    refetch,
  } = useGetHsCodeQuery(id, {
    skip: !id,
  });

  const {
    data: revisions,
  } = useGetHsRevisionsQuery();

  const revision = revisions?.find(
    (item) =>
      item.id === hsCode?.revisionId,
  );

  return (
    <main
      style={{
        width: "100%",
        maxWidth: "1400px",
        margin: "0 auto",
        padding: "16px 24px 32px",
      }}
    >
      <Stack gap="md">
        <BackLink
          label={t(
            "backToHsCodes",
            "Back to HS codes",
          )}
        />

        {(FORCE_LOADING || isLoading) && (
          <HsLoadingState />
        )}

        {!FORCE_LOADING &&
          !isLoading &&
          (FORCE_ERROR ||
            isError ||
            !hsCode) && (
            <Alert
              color="red"
              variant="light"
              title={t(
                "errorTitle",
                "Something went wrong",
              )}
            >
              <Stack gap="sm">
                <Text size="sm">
                  {t(
                    "hsDetailError",
                    "The requested HS code could not be loaded.",
                  )}
                </Text>

                <Group>
                  <Button
                    variant="light"
                    color="red"
                    size="xs"
                    onClick={() =>
                      refetch()
                    }
                  >
                    {t(
                      "retry",
                      "Retry",
                    )}
                  </Button>
                </Group>
              </Stack>
            </Alert>
          )}

        {!FORCE_LOADING &&
          !isLoading &&
          !FORCE_ERROR &&
          !isError &&
          hsCode && (
            <>
              <Paper
                withBorder
                radius="md"
                p={{
                  base: "md",
                  sm: "lg",
                }}
              >
                <Stack gap="xs">
                  <Group
                    gap="xs"
                    align="center"
                  >
                    <ThemeIcon
                      variant="light"
                      color="blue"
                      radius="sm"
                      size="sm"
                    >
                      #
                    </ThemeIcon>

                    <Title
                      order={2}
                      size="clamp(1.35rem, 3vw, 1.75rem)"
                    >
                      {t(
                        "hsCodeDetails",
                        "HS code details",
                      )}
                    </Title>
                  </Group>

                  <Text
                    c="dimmed"
                    size="sm"
                  >
                    {t(
                      "hsCodeDetailsIntro",
                      "Detailed information provided by the HS code.",
                    )}
                  </Text>

                  <Text
                    ff="monospace"
                    fw={700}
                    size="md"
                    c="blue"
                    mt={2}
                  >
                    {hsCode.code}
                  </Text>
                </Stack>
              </Paper>

              <HsCodeDetails
                hsCode={hsCode}
                revision={revision}
              />
            </>
          )}
      </Stack>
    </main>
  );
}

function BackLink({
  label,
}: {
  label: string;
}) {
  return (
    <Anchor
      component={Link}
      href="/hs-codes"
      size="sm"
      c="dimmed"
      underline="hover"
    >
      ← {label}
    </Anchor>
  );
}
