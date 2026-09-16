"use client";

import {
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useTranslation } from "react-i18next";

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
  color: "#697e88",
  marginBottom: "7px",
};

const valueStyle = {
  margin: 0,
  fontSize: "14px",
  color: "#182c3d",
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
      radius={8}
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
            "1px solid #dce5e9",
          background: "#fff",
        },

        title: {
          fontSize: "17px",
          fontWeight: 600,
          color: "#182c3d",
        },

        close: {
          color: "#566976",
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
          <div
            style={{
              minHeight: "260px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Loader
              size="md"
              color="#228be6"
            />
          </div>
        ) : isError || !hsCode ? (
          <Stack
            align="center"
            justify="center"
            gap="sm"
            py={40}
          >
            <Text
              fw={600}
              c="#182c3d"
            >
              {t(
                "errorTitle",
                "Something went wrong",
              )}
            </Text>

            <Text
              size="sm"
              c="#697e88"
              ta="center"
              maw={420}
            >
              {t(
                "hsDetailError",
                "The requested HS code could not be loaded.",
              )}
            </Text>

            <Button
              variant="default"
              size="sm"
              onClick={() => refetch()}
            >
              {t(
                "retry",
                "Retry",
              )}
            </Button>
          </Stack>
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
                    color: "#176b70",
                    background: "#eaf3f3",
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
                  color: "#182c3d",
                }}
              >
                {hsCode.code}
              </Title>

              <Text
                size="sm"
                c="#697e88"
              >
                {t(
                  "hsCodeDetailsIntro",
                  "Detailed information provided by the HS code.",
                )}
              </Text>
            </div>

            {/* Description */}
            <div
              style={{
                background: "#edf5f5",
                padding: "20px",
                borderRadius: "8px",
              }}
            >
              <Text
                size="xs"
                fw={500}
                c="#526875"
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
                c="#182c3d"
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
                      color="#cbdedf"
                    />

                    <Text
                      size="xs"
                      fw={500}
                      c="#526875"
                      mb={8}
                    >
                      Amharic
                    </Text>

                    <Text
                      size="sm"
                      c="#345866"
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
                c="#182c3d"
                mb={6}
              >
                {t(
                  "revisionInformation",
                  "Revision information",
                )}
              </Text>

              <Text
                size="xs"
                c="#697e88"
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
                    background: "#f7f8fa",
                    border:
                      "1px solid #e3e9ed",
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