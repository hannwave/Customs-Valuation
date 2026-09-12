"use client";
import { Badge, Card, Divider, Box, SimpleGrid, Stack, Text, Group, rem, } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { HsCode, HsRevision, } from "@/lib/types/customs";

interface HsCodeDetailsProps {
  hsCode: HsCode;
  revision?: HsRevision;
  isLoading?: boolean;
}

export function HsCodeDetails({
  hsCode,
  revision,
  isLoading = false,
}: HsCodeDetailsProps) {
  const { t, i18n } = useTranslation();

  const description =
    i18n.language === "am"
      ? hsCode.descriptionAm ||
        hsCode.descriptionEn
      : hsCode.descriptionEn;

  const usingEnglishFallback =
    i18n.language === "am" &&
    !hsCode.descriptionAm;

  if (isLoading) {
    return (
      <Card
        withBorder
        radius="md"
        padding="xl"
      >
        <Stack gap="xl">
          <Box>
            <Text
              size="sm"
              c="dimmed"
            >
              {t("code", "Code")}
            </Text>

            <Box
              mt={rem(4)}
              h={rem(40)}
              w={rem(150)}
              bg="gray.2"
              style={{
                borderRadius: rem(4),
              }}
            />
          </Box>

          <Box>
            <Text
              size="sm"
              c="dimmed"
            >
              {t(
                "description",
                "Description",
              )}
            </Text>

            <Box
              mt={rem(4)}
              h={rem(24)}
              w="80%"
              bg="gray.2"
              style={{
                borderRadius: rem(4),
              }}
            />
          </Box>

          <Box>
            <Text
              size="sm"
              c="dimmed"
            >
              {t(
                "revision",
                "Revision",
              )}
            </Text>

            <Box
              mt={rem(4)}
              h={rem(24)}
              w={rem(120)}
              bg="gray.2"
              style={{
                borderRadius: rem(4),
              }}
            />
          </Box>
        </Stack>
      </Card>
    );
  }

  return (
    <Card
      withBorder
      radius="md"
      padding="xl"
      style={{
        backgroundColor:
          "var(--mantine-color-body)",
      }}
    >
      <Stack gap="xl">
        <Box>
          <Text
            size="xs"
            c="dimmed"
            tt="uppercase"
            fw={600}
            style={{
              letterSpacing: "0.5px",
            }}
          >
            {t("code", "Code")}
          </Text>

          <Text
            fw={700}
            size="2rem"
            ff="monospace"
            mt={4}
            c="blue"
            style={{
              letterSpacing: "0.5px",
              overflowWrap: "anywhere",
            }}
          >
            {hsCode.code}
          </Text>
        </Box>

        <Divider />

        <Box>
          <Text
            size="xs"
            c="dimmed"
            tt="uppercase"
            fw={600}
            style={{
              letterSpacing: "0.5px",
            }}
          >
            {t(
              "description",
              "Description",
            )}
          </Text>

          <Text
            size="lg"
            mt={4}
            style={{
              lineHeight: 1.6,
            }}
          >
            {description}
          </Text>

          {usingEnglishFallback && (
            <Badge
              size="sm"
              variant="dot"
              color="orange"
              mt="sm"
            >
              {t(
                "needsReview",
                "Needs Review",
              )}
            </Badge>
          )}
        </Box>

        <Divider />

        <Box>
          <Text
            size="xs"
            c="dimmed"
            tt="uppercase"
            fw={600}
            style={{
              letterSpacing: "0.5px",
            }}
          >
            {t(
              "revisionInformation",
              "Revision information",
            )}
          </Text>

          <Text
            size="sm"
            c="dimmed"
            mt={4}
          >
            {t(
              "revisionInformationHint",
              "Classification revision associated with this HS code.",
            )}
          </Text>
        </Box>

        {revision ? (
          <>
            <Group
              justify="space-between"
              align="center"
              wrap="wrap"
              gap="sm"
            >
              <Box>
                <Text
                  size="xs"
                  c="dimmed"
                  tt="uppercase"
                  fw={600}
                  style={{
                    letterSpacing:
                      "0.5px",
                  }}
                >
                  {t(
                    "revision",
                    "Revision",
                  )}
                </Text>

                <Text
                  fw={600}
                  size="md"
                  mt={4}
                >
                  {revision.name}
                </Text>
              </Box>

              <Badge
                variant="light"
                color="blue"
                size="md"
              >
                {t(
                  "currentRevision",
                  "Current",
                )}
              </Badge>
            </Group>

            <SimpleGrid
              cols={{
                base: 1,
                sm: 2,
                md: 3,
              }}
              spacing="lg"
            >
              <Box
                p="md"
                bg="gray.0"
                style={{
                  borderRadius: rem(8),
                }}
              >
                <Text
                  size="xs"
                  c="dimmed"
                  tt="uppercase"
                  fw={600}
                  style={{
                    letterSpacing:
                      "0.5px",
                  }}
                >
                  {t(
                    "revisionNumber",
                    "Revision number",
                  )}
                </Text>

                <Text
                  fw={500}
                  mt={4}
                >
                  {revision.number}
                </Text>
              </Box>

              <Box
                p="md"
                bg="gray.0"
                style={{
                  borderRadius: rem(8),
                }}
              >
                <Text
                  size="xs"
                  c="dimmed"
                  tt="uppercase"
                  fw={600}
                  style={{
                    letterSpacing:
                      "0.5px",
                  }}
                >
                  {t(
                    "effectiveDate",
                    "Effective date",
                  )}
                </Text>

                <Text
                  fw={500}
                  mt={4}
                >
                  {revision.effectiveDate ||
                    t(
                      "notSet",
                      "Not set",
                    )}
                </Text>
              </Box>

              <Box
                p="md"
                bg="gray.0"
                style={{
                  borderRadius: rem(8),
                }}
              >
                <Text
                  size="xs"
                  c="dimmed"
                  tt="uppercase"
                  fw={600}
                  style={{
                    letterSpacing:
                      "0.5px",
                  }}
                >
                  {t(
                    "endDate",
                    "End date",
                  )}
                </Text>

                <Text
                  fw={500}
                  mt={4}
                >
                  {revision.endDate ??
                    t(
                      "currentRevision",
                      "Current",
                    )}
                </Text>
              </Box>
            </SimpleGrid>

            <Box>
              <Text
                size="xs"
                c="dimmed"
                tt="uppercase"
                fw={600}
                style={{
                  letterSpacing:
                    "0.5px",
                }}
              >
                {t(
                  "revision",
                  "Revision",
                )}
              </Text>

              <Text
                fw={500}
                mt={4}
              >
                {revision.name}
              </Text>
            </Box>
          </>
        ) : (
          <Box
            p="md"
            style={{
              border: "1px solid var(--mantine-color-gray-3)",
              borderRadius: rem(8),
            }}
          >
            <Text
              fw={600}
              size="sm"
            >
              {t(
                "revisionUnavailableTitle",
                "Revision information unavailable",
              )}
            </Text>

            <Text
              size="sm"
              c="dimmed"
              mt={4}
            >
              {t(
                "revisionUnavailable",
                "The revision associated with this HS code could not be loaded.",
              )}
            </Text>
          </Box>
        )}
      </Stack>
    </Card>
  );
}
