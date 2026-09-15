"use client";

import {
  Button,
  Paper,
  Table,
  Text,
  Tooltip,
  Box,
} from "@mantine/core";
import { useTranslation } from "react-i18next";

import type {
  HsCode,
  HsRevision,
} from "@/lib/types/customs";

interface HsResultsTableProps {
  items: HsCode[];
  revisions: HsRevision[];
  onViewDetails: (id: string) => void;
}

export function HsResultsTable({
  items,
  revisions,
  onViewDetails,
}: HsResultsTableProps) {
  const { t, i18n } = useTranslation();

  const getRevision = (revisionId: string) => {
    return revisions.find(
      (revision) =>
        revision.id === revisionId,
    );
  };

  const getRevisionName = (
    revisionId: string,
  ) => {
    return (
      getRevision(revisionId)?.name ??
      t(
        "hsCatalogue.revisionUnavailable",
        "Revision unavailable",
      )
    );
  };

  const getDescription = (
    item: HsCode,
  ) => {
    if (i18n.language === "am") {
      return (
        item.descriptionAm ||
        item.descriptionEn
      );
    }

    return item.descriptionEn;
  };

  return (
    <Paper
      withBorder
      radius={9}
      shadow="none"
      style={{
        background: "#fff",
        borderColor: "#dce5e9",
        overflow: "hidden",
      }}
    >
      {/* Results table */}
      <Box
        style={{
          overflowX: "auto",
        }}
        tabIndex={0}
        role="region"
        aria-label={t(
          "hsCatalogue.results",
          "HS code results",
        )}
      >
        <Table
          style={{
            minWidth: "880px",
            borderCollapse: "collapse",
          }}
        >
          <Table.Thead>
            <Table.Tr>
              {/* HS Code */}
              <Table.Th
                style={{
                  background: "#f5f8fa",
                  padding: "13px 16px",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.6px",
                  textTransform:
                    "uppercase",
                  whiteSpace: "nowrap",
                  color: "#526875",
                  borderBottom:
                    "1px solid #dce5e9",
                }}
              >
                {t(
                  "hsCatalogue.codeLabel",
                  "HS code",
                )}
              </Table.Th>

              {/* Description */}
              <Table.Th
                style={{
                  background: "#f5f8fa",
                  padding: "13px 16px",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.6px",
                  textTransform:
                    "uppercase",
                  whiteSpace: "nowrap",
                  color: "#526875",
                  borderBottom:
                    "1px solid #dce5e9",
                }}
              >
                {t(
                  "hsCatalogue.descriptionLabel",
                  "Description",
                )}
              </Table.Th>

              {/* Revision */}
              <Table.Th
                style={{
                  background: "#f5f8fa",
                  padding: "13px 16px",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.6px",
                  textTransform:
                    "uppercase",
                  whiteSpace: "nowrap",
                  color: "#526875",
                  borderBottom:
                    "1px solid #dce5e9",
                }}
              >
                {t(
                  "hsCatalogue.revision",
                  "Revision",
                )}
              </Table.Th>

              {/* Action */}
              <Table.Th
                style={{
                  background: "#f5f8fa",
                  padding: "13px 16px",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.6px",
                  textTransform:
                    "uppercase",
                  whiteSpace: "nowrap",
                  color: "#526875",
                  borderBottom:
                    "1px solid #dce5e9",
                }}
              >
                {t(
                  "hsCatalogue.action",
                  "Action",
                )}
              </Table.Th>
            </Table.Tr>
          </Table.Thead>

          <Table.Tbody>
            {items.map((item) => {
              const revision =
                getRevision(
                  item.revisionId,
                );

              const hasAmharicDescription =
                Boolean(
                  item.descriptionAm,
                );

              return (
                <Table.Tr
                  key={item.id}
                  style={{
                    transition:
                      "background-color 120ms ease",
                  }}
                  onMouseEnter={(
                    event,
                  ) => {
                    event.currentTarget.style.backgroundColor =
                      "#f9fcfc";
                  }}
                  onMouseLeave={(
                    event,
                  ) => {
                    event.currentTarget.style.backgroundColor =
                      "";
                  }}
                >
                  {/* HS Code */}
                  <Table.Td
                    style={{
                      padding:
                        "18px 16px",
                      fontSize: "12px",
                      verticalAlign:
                        "middle",
                      borderBottom:
                        "1px solid #edf1f3",
                    }}
                  >
                    <span
                      style={{
                        fontFamily:
                          "Consolas, monospace",
                        fontSize: "12px",
                        color: "#176b70",
                        background:
                          "#eaf3f3",
                        borderRadius:
                          "4px",
                        padding:
                          "4px 7px",
                        display:
                          "inline-block",
                        letterSpacing:
                          "0.6px",
                        whiteSpace:
                          "nowrap",
                      }}
                    >
                      {item.code}
                    </span>
                  </Table.Td>

                  {/* Description */}
                  <Table.Td
                    style={{
                      padding:
                        "18px 16px",
                      fontSize: "12px",
                      verticalAlign:
                        "middle",
                      borderBottom:
                        "1px solid #edf1f3",
                    }}
                  >
                    <Text
                      size="sm"
                      style={{
                        fontSize: "13px",
                        color: "#182c3d",
                        lineHeight: 1.5,
                        maxWidth:
                          "420px",
                      }}
                      lineClamp={2}
                    >
                      {getDescription(
                        item,
                      )}
                    </Text>

                    {i18n.language ===
                      "am" &&
                      !hasAmharicDescription && (
                        <span
                          style={{
                            display:
                              "inline-flex",
                            alignItems:
                              "center",
                            gap: "6px",
                            borderRadius:
                              "20px",
                            padding:
                              "6px 9px",
                            fontSize:
                              "10px",
                            whiteSpace:
                              "nowrap",
                            color:
                              "#8a601a",
                            background:
                              "#fff5df",
                            marginTop:
                              "6px",
                          }}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              width:
                                "5px",
                              height:
                                "5px",
                              borderRadius:
                                "50%",
                              background:
                                "currentColor",
                              flexShrink: 0,
                            }}
                          />

                          {t(
                            "needsReview",
                            "Needs Review",
                          )}
                        </span>
                      )}
                  </Table.Td>

                  {/* Revision */}
                  <Table.Td
                    style={{
                      padding:
                        "18px 16px",
                      fontSize: "12px",
                      verticalAlign:
                        "middle",
                      borderBottom:
                        "1px solid #edf1f3",
                    }}
                  >
                    <span
                      style={{
                        display:
                          "inline-flex",
                        alignItems:
                          "center",
                        gap: "6px",
                        borderRadius:
                          "20px",
                        padding:
                          "6px 9px",
                        fontSize: "10px",
                        whiteSpace:
                          "nowrap",
                        color: "#25674f",
                        background:
                          "#edf6f0",
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: "5px",
                          height: "5px",
                          borderRadius:
                            "50%",
                          background:
                            "currentColor",
                          flexShrink: 0,
                        }}
                      />

                      {getRevisionName(
                        item.revisionId,
                      )}
                    </span>

                    {revision && (
                      <small
                        style={{
                          display:
                            "block",
                          fontSize: "10px",
                          color: "#697e88",
                          marginTop:
                            "6px",
                        }}
                      >
                        {t(
                          "hsCatalogue.effectiveDate",
                          "Effective",
                        )}
                        :{" "}
                        {
                          revision.effectiveDate
                        }
                      </small>
                    )}
                  </Table.Td>

                  {/* Details */}
                  <Table.Td
                    style={{
                      padding:
                        "18px 16px",
                      fontSize: "12px",
                      verticalAlign:
                        "middle",
                      borderBottom:
                        "1px solid #edf1f3",
                    }}
                  >
                    <Tooltip
                      label={t(
                        "hsCatalogue.viewDetails",
                        "Details",
                      )}
                      withArrow
                    >
                      <Button
                        type="button"
                        variant="subtle"
                        color="teal"
                        size="sm"
                        radius={0}
                        onClick={() =>
                          onViewDetails(
                            item.id,
                          )
                        }
                        styles={{
                          root: {
                            background:
                              "none",
                            color:
                              "#176b70",
                            fontSize:
                              "12px",
                            fontWeight:
                              400,
                            padding:
                              "8px 0",
                            whiteSpace:
                              "nowrap",
                            height:
                              "auto",
                          },
                        }}
                      >
                        {t(
                          "hsCatalogue.viewDetails",
                          "View",
                        )}{" "}
                        <span
                          aria-hidden="true"
                          style={{
                            marginLeft:
                              "4px",
                          }}
                        >
                          ↗
                        </span>
                      </Button>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Box>
    </Paper>
  );
}