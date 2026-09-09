"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Alert,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useTranslation } from "react-i18next";

import { HsCodeDetails } from "@/components/hs-codes/HsCodeDetails";

import {
  useGetHsCodeQuery,
  useGetHsRevisionsQuery,
} from "@/lib/store/api/hsCodesApi";

export default function HsCodeDetailPage() {
  const { t } = useTranslation();

  const params = useParams();

  const id =
    typeof params.id === "string"
      ? params.id
      : "";

  /*
   * Load the selected HS code.
   */
  const {
    data: hsCode,
    isLoading,
    isError,
    refetch,
  } = useGetHsCodeQuery(id, {
    skip: !id,
  });

  /*
   * Load revisions so we can display
   * the revision name/details.
   */
  const {
    data: revisions,
  } = useGetHsRevisionsQuery();

  /*
   * Find the revision belonging to
   * this HS code.
   */
  const revision = revisions?.find(
    (item) =>
      item.id === hsCode?.revisionId,
  );

  /*
   * Loading state
   */
  if (isLoading) {
    return (
      <main className="hs-detail-page">
        <HsDetailLoading />
      </main>
    );
  }

  /*
   * Error / unavailable state
   */
  if (isError || !hsCode) {
    return (
      <main className="hs-detail-page">
        <Stack gap="lg">
          <Button
            component={Link}
            href="/hs-codes"
            variant="subtle"
            w="fit-content"
          >
            ←{" "}
            {t(
              "backToHsCodes",
              "Back to HS codes",
            )}
          </Button>

          <Alert
            color="red"
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

              <Button
                variant="light"
                color="red"
                size="sm"
                onClick={() => refetch()}
              >
                {t(
                  "retry",
                  "Retry",
                )}
              </Button>
            </Stack>
          </Alert>
        </Stack>
      </main>
    );
  }

  /*
   * Successful detail page
   */
  return (
    <main className="hs-detail-page">
      <Stack gap="xl">
        {/* Back navigation */}
        <Button
          component={Link}
          href="/hs-codes"
          variant="subtle"
          w="fit-content"
        >
          ←{" "}
          {t(
            "backToHsCodes",
            "Back to HS codes",
          )}
        </Button>

        {/* Header */}
        <section>
          <Title order={1}>
            {t(
              "hsCodeDetails",
              "HS code details",
            )}
          </Title>

          <Text
            c="dimmed"
            mt="xs"
          >
            {t(
              "hsCodeDetailsIntro",
              "Detailed information provided by the HS catalogue.",
            )}
          </Text>
        </section>

        {/* Details component */}
        <HsCodeDetails
          hsCode={hsCode}
          revision={revision}
        />

        {/* Bottom navigation */}
        <Group>
          <Button
            component={Link}
            href="/hs-codes"
            variant="light"
          >
            {t(
              "backToHsCodes",
              "Back to HS codes",
            )}
          </Button>
        </Group>
      </Stack>
    </main>
  );
}

/*
 * Local loading component for the detail page.
 *
 * This still uses Mantine.
 */
function HsDetailLoading() {
  const { t } = useTranslation();

  return (
    <Card
      withBorder
      radius="md"
      padding="xl"
    >
      <Stack
        align="center"
        justify="center"
        gap="sm"
        mih={200}
      >
        <Loader size="md" />

        <Text c="dimmed">
          {t(
            "loading",
            "Loading...",
          )}
        </Text>
      </Stack>
    </Card>
  );
}