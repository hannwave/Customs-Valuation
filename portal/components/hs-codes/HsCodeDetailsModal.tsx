"use client";

import {
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { HsLoadingState } from "./HsLoadingState";
import { HsErrorState } from "./HsErrorState";

import {
  useGetHsCodeQuery,
  useGetHsRevisionsQuery,
} from "@/lib/store/api/hsCodesApi";

interface HsCodeDetailsModalProps {
  hsCodeId: string | null;
  opened: boolean;
  onClose: () => void;
}

const labelStyle = {
  fontSize: "12px",
  color: "var(--muted)",
  marginBottom: "7px",
};

const valueStyle = {
  margin: 0,
  fontSize: "14px",
  color: "var(--navy)",
};

export function HsCodeDetailsModal({
  hsCodeId,
  opened,
  onClose,
}: HsCodeDetailsModalProps) {
  const { t, i18n } = useTranslation();

  const {
    data: hsCode,
    isLoading,
    isError,
    refetch,
  } = useGetHsCodeQuery(hsCodeId ?? "", {
    skip: !hsCodeId || !opened,
  });

  const {
    data: revisions,
    isLoading: revisionsLoading,
  } = useGetHsRevisionsQuery();

  const revision = revisions?.find(
    (item) => item.id === hsCode?.revisionId,
  );

  const description =
    i18n.language === "am"
      ? hsCode?.descriptionAm || hsCode?.descriptionEn
      : hsCode?.descriptionEn;

  const isLoadingDetails =
    isLoading || revisionsLoading;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      size="lg"
      radius="lg"
      padding={0}
      title={t(
        "hsCodeDetails",
        "HS code details",
      )}
      styles={{
        content: {
          overflow: "hidden",
        },

        header: {
          padding: "20px",
          borderBottom:
            "1px solid var(--line)",
          background: "#fff",
        },

        title: {
          fontSize: "17px",
          fontWeight: 600,
          color: "var(--navy)",
        },

        close: {
          color: "var(--muted)",
        },

        body: {
          padding: 0,
          maxHeight: "70vh",
          overflowY: "auto",
        },
      }}
    >
      <div
        style={{
          padding: "20px",
        }}
      >
        {isLoadingDetails ? (
          <HsLoadingState/>
        ) : isError || !hsCode ? (
          <HsErrorState onRetry={() => void refetch()} message={t("hsDetailError", "The requested HS code could not be loaded.")}/>
        ) : (
          <Stack gap="lg">
            {/* HS code header */}
            <div>
              <Group
                justify="space-between"
                align="center"
                gap="md"
              >
                <span
                  style={{
                    fontFamily:
                      "Consolas, monospace",
                    fontSize: "13px",
                    color: "var(--blue)",
                    background: "var(--pale)",
                    borderRadius: "4px",
                    padding: "6px 9px",
                    letterSpacing: "0.6px",
                  }}
                >
                  {hsCode.code}
                </span>

                {revision?.status && (
                  <Badge
                    color="green"
                    variant="light"
                    radius="xl"
                    size="sm"
                  >
                    {revision.status}
                  </Badge>
                )}
              </Group>

              <Title
                order={2}
                mt="lg"
                mb={8}
                style={{
                  fontSize: "23px",
                  fontWeight: 600,
                  color: "var(--navy)",
                }}
              >
                {hsCode.code}
              </Title>

              <Text
                size="sm"
                c="var(--muted)"
              >
                {t(
                  "hsCodeDetailsIntro",
                  "Detailed information provided by the HS code.",
                )}
              </Text>
            </div>

            <div
              style={{
                background: "var(--pale)",
                padding: "20px",
                borderRadius: "8px",
              }}
            >
              <Text
                size="xs"
                fw={500}
                c="var(--muted)"
                mb={8}
              >
                {t(
                  "hsCatalogue.duty",
                  "Customs duty",
                )}
              </Text>

              <Badge
                variant="light"
                size="lg"
                color={
                  hsCode.duty?.toLowerCase() === "prohibited"
                    ? "red"
                    : hsCode.duty?.toLowerCase() === "free"
                      ? "green"
                      : "blue"
                }
                mb="md"
              >
                {hsCode.duty ||
                  t(
                    "hsCatalogue.dutyUnavailable",
                    "Not set",
                  )}
              </Badge>

              <Text
                size="xs"
                fw={500}
                c="var(--muted)"
                mb={8}
              >
                {t(
                  "hsCatalogue.descriptionLabel",
                  "Description",
                )}
              </Text>

              <Text
                size="md"
                fw={500}
                c="var(--navy)"
                style={{
                  lineHeight: 1.6,
                }}
              >
                {description ||
                  t(
                    "englishFallback",
                    "English description",
                  )}
              </Text>

              {i18n.language === "am" &&
                !hsCode.descriptionAm && (
                  <Text
                    size="xs"
                    c="#8a601a"
                    mt="sm"
                  >
                    {t(
                      "needsReview",
                      "Needs Review",
                    )}
                  </Text>
                )}

              {i18n.language !== "am" &&
                hsCode.descriptionAm && (
                  <>
                    <Divider
                      my="md"
                      color="var(--line)"
                    />

                    <Text
                      size="xs"
                      fw={500}
                      c="var(--muted)"
                      mb={8}
                    >
                      Amharic
                    </Text>

                    <Text
                      size="sm"
                      c="var(--ink)"
                      style={{
                        lineHeight: 1.6,
                      }}
                    >
                      {hsCode.descriptionAm}
                    </Text>
                  </>
                )}
            </div>

            {/* Revision information */}
            <div>
              <Text
                fw={600}
                size="sm"
                c="var(--navy)"
                mb={6}
              >
                {t(
                  "revisionInformation",
                  "Revision information",
                )}
              </Text>

              <Text
                size="xs"
                c="var(--muted)"
                mb="md"
              >
                {t(
                  "revisionInformationHint",
                  "Classification revision associated with this HS code.",
                )}
              </Text>

              {revision ? (
                <div
                  style={{
                    background: "var(--surface)",
                    border:
                      "1px solid var(--line)",
                    borderRadius: "8px",
                    padding: "16px",
                  }}
                >
                  <dl
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "1fr 1fr",
                      gap: "18px 16px",
                      margin: 0,
                    }}
                  >
                    <div>
                      <dt style={labelStyle}>
                        {t(
                          "hsCatalogue.revision",
                          "Revision",
                        )}
                      </dt>

                      <dd style={valueStyle}>
                        {revision.name}
                      </dd>
                    </div>

                    <div>
                      <dt style={labelStyle}>
                        {t(
                          "revisionNumber",
                          "Revision number",
                        )}
                      </dt>

                      <dd style={valueStyle}>
                        {revision.number}
                      </dd>
                    </div>

                    <div>
                      <dt style={labelStyle}>
                        {t(
                          "effectiveDate",
                          "Effective date",
                        )}
                      </dt>

                      <dd style={valueStyle}>
                        {revision.effectiveDate}
                      </dd>
                    </div>

                    <div>
                      <dt style={labelStyle}>
                        {t(
                          "endDate",
                          "End date",
                        )}
                      </dt>

                      <dd style={valueStyle}>
                        {revision.endDate || "—"}
                      </dd>
                    </div>

                    <div>
                      <dt style={labelStyle}>
                        Status
                      </dt>

                      <dd style={valueStyle}>
                        {revision.status}
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <div
                  style={{
                    background: "#fff5df",
                    border:
                      "1px solid #ead9ad",
                    borderRadius: "8px",
                    padding: "16px",
                  }}
                >
                  <Text
                    size="sm"
                    fw={500}
                    c="#8a601a"
                    mb={4}
                  >
                    {t(
                      "revisionUnavailableTitle",
                      "Revision information unavailable",
                    )}
                  </Text>

                  <Text
                    size="xs"
                    c="#8a601a"
                  >
                    {t(
                      "revisionUnavailable",
                      "The revision associated with this HS code could not be loaded.",
                    )}
                  </Text>
                </div>
              )}
            </div>
          </Stack>
        )}
      </div>
    </Modal>
  );
}
