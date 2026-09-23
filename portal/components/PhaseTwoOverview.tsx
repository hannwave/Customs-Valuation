"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  FiAlertCircle,
  FiBookOpen,
  FiCheck,
  FiCheckCircle,
  FiChevronRight,
  FiEdit2,
  FiFileText,
  FiInfo,
  FiMinus,
  FiPlus,
  FiRefreshCw,
  FiSave,
  FiSearch,
  FiX,
} from "react-icons/fi";
import { FeedbackToast } from "@/components/FeedbackToast";
import {
  calculatePhase2,
  downloadPhase1Receipt,
  loadPhase2,
  savePhase2,
  searchPhase2HsCodes,
} from "@/lib/phase2Api";
import type {
  HsCode,
  Phase2Request,
  Phase2Response,
  Phase2TaxLineRequest,
} from "@/lib/types/customs";
import { readValuationSession } from "@/lib/valuation-session";
import { officerNoteIssue } from "@/lib/officer-note-quality";

type PhaseTwoOverviewProps = {
  onBackToReview?: () => void;
};

function recommendedHsCode(product: string) {
  const normalized = product.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const phoneAccessory = /\b(case|cover|charger|charging|cable|adapter|screen protector|display|battery|earbuds?|headphones?|holder|mount|parts?)\b/.test(normalized);
  if (/\b(iphones?|i phones?|smartphones?|smart phones?|mobile phones?|cellular phones?|samsung|galaxy|huawei|xiaomi|redmi|oppo|vivo|oneplus|pixel|nokia|motorola|tecno|infinix|itel|realme|poco|nothing phones?)\b/.test(normalized) && !phoneAccessory) return "851713";

  // Cigars → HS 2402.10
  const nonCigarProduct = /\b(electronic|e cigar|holder|case|cutter|humidor|lighter|ashtray|parts?)\b/.test(normalized);
  if (/\b(cigar|cigars|habano|habanos|cohiba|montecristo|romeo y julieta|partagas|bolivar|punch|hoyo de monterrey)\b/.test(normalized) && !nonCigarProduct) return "240210";

  // Cigarettes → HS 2402.20
  const nonTobaccoProduct = /\b(electronic|e cigarette|ecigarette|vape|vaping|holder|paper|filter|case|machine|parts?)\b/.test(normalized);
  if (/\b(cigarette|cigarettes|cigaret|cigarets|cigarate|cigarates|cigerette|cigerettes)\b/.test(normalized) && !nonTobaccoProduct) return "240220";

  // Laptops / Notebooks → HS 8471.30
  if (/\b(laptop|notebook|macbook|thinkpad|chromebook|computer|pc)\b/.test(normalized)) return "847130";

  // Motor Vehicles → HS 8703.23
  if (/\b(car|automobile|vehicle|sedan|suv|motor car|toyota|hyundai)\b/.test(normalized)) return "870323";

  return null;
}

function displayHsCode(item: HsCode | null | undefined) {
  if (!item) return "";
  const normalized = item.code?.replace(/\D/g, "");
  if (normalized === "240210") return item.tariffItemNo || "2402.1000";
  if (normalized === "240220") return item.tariffItemNo || "2402.2000";
  if (normalized === "851713") return item.tariffItemNo || "8517.1390";
  if (normalized === "847130") return item.tariffItemNo || "8471.3000";
  if (normalized === "870323") return item.tariffItemNo || "8703.2390";
  return item.tariffItemNo || item.code || "";
}

function exciseUnitFor(item: HsCode): string {
  const code = `${item.tariffItemNo ?? ""}${item.code ?? ""}`.replace(/\D/g, "");
  if (code.startsWith("240210") || code.startsWith("39232110") || code.startsWith("39232910")) return "Kilograms (KG)";
  if (code.startsWith("240220")) return "Pack (20 sticks)";
  if (code.startsWith("220300") || code.startsWith("220600") || code.startsWith("22089010")) return "Litres (L)";
  return "Pieces (PCS)";
}

/** Rates are calculated by the backend from the selected national tariff and excise schedule. */
function applyRecommendedRates(draft: Phase2Request, item: HsCode): Phase2Request {
  return {
    ...draft,
    selectedHsCodeId: item.id,
    unit: exciseUnitFor(item),
    taxLines: pendingTaxLines(),
    exciseTaxApplicable: false,
  };
}

const categories = [
  "General goods",
  "Food",
  "Textile / garment",
  "Alcoholic beverage",
  "Non-alcoholic beverage",
  "Tobacco",
  "Plastic bag",
  "Motor vehicle",
  "Fertilizer",
  "Petroleum",
  "Lubricants",
  "Capital goods",
  "Aircraft",
  "Other",
];

const exemptionOptions = [
  ["DIPLOMATIC", "Diplomatic goods"],
  ["TAX_EXEMPT", "General tax exemption"],
  ["VAT_EXEMPT", "VAT exemption"],
  ["SURTAX_EXEMPT", "Surtax exemption"],
  ["SOCIAL_WELFARE_EXEMPT", "Social welfare levy exemption"],
  ["WITHHOLDING_NOT_APPLICABLE", "Withholding not applicable"],
] as const;

const permanentTaxDefinitions = [
  { name: "Customs Duty", calculationBasis: "CIF", order: 1 },
  { name: "Excise Tax", calculationBasis: "CIFPlusDuty", order: 2 },
  { name: "Surtax", calculationBasis: "CIFPlusDutyPlusExcise", order: 4 },
  { name: "VAT", calculationBasis: "CIFPlusDutyPlusExcisePlusSurtax", order: 5 },
  { name: "Withholding Tax", calculationBasis: "CIF", order: 6 },
  { name: "Social Welfare Levy", calculationBasis: "CIF", order: 7 },
] as const;

const standardTaxNames: string[] = permanentTaxDefinitions.map((line) => line.name);

function pendingTaxLines(): Phase2TaxLineRequest[] {
  return permanentTaxDefinitions.map((line) => ({
    name: line.name,
    calculationType: "Percentage",
    value: 0,
    currency: "ETB",
    order: line.order,
    calculationBasis: line.calculationBasis,
    notes: "Load the recommended rate before completing this assessment.",
    isApplicable: true,
    status: "Pending",
  }));
}

function ensurePermanentTaxLines(lines: Phase2TaxLineRequest[]) {
  const byName = new Map(lines.map((line) => [line.name.toLowerCase(), line]));
  const permanent = permanentTaxDefinitions.map((definition) =>
    byName.get(definition.name.toLowerCase()) ?? {
      name: definition.name,
      calculationType: "Percentage" as const,
      value: 0,
      currency: "ETB",
      order: definition.order,
      calculationBasis: definition.calculationBasis,
      notes: "Load the recommended rate before completing this assessment.",
      isApplicable: true,
      status: "Pending" as const,
    },
  );
  const extras = lines.filter(
    (line) => !permanentTaxDefinitions.some((d) => d.name.toLowerCase() === line.name.toLowerCase()),
  );
  return [...permanent, ...extras]
    .sort((left, right) => (left.order ?? 99) - (right.order ?? 99))
    .map((line, index) => ({ ...line, order: index + 1 }));
}

function phase1Value(data: Phase2Response) {
  const amount = Number(data.phase1.initialDuty);
  const currency = data.phase1.initialDutyCurrency?.trim().toUpperCase() || "ETB";
  return {
    amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
    currency,
  };
}

const emptyDraft = (seed?: { amount: number; currency: string }): Phase2Request => ({
  selectedHsCodeId: null,
  targetCurrency: seed?.amount ? seed.currency : "ETB",
  exchangeRate: 1,
  exchangeRateSource: seed?.amount ? "Phase 1 selected customs value" : "Same currency",
  exchangeRateDate: null,
  exemptionAmount: 0,
  waiverAmount: 0,
  manualAdjustmentAmount: 0,
  manualAdjustmentType: "Fixed",
  notes: "",
  taxLines: pendingTaxLines(),
  customsValueAmount: seed?.amount ?? 0,
  customsValueCurrency: seed?.amount ? seed.currency : "ETB",
  quantity: 1,
  unit: "Pieces (PCS)",
  originCountry: "",
  productCategory: "General goods",
  exemptionCodes: [],
  originPreferenceClaimed: false,
  exciseTaxApplicable: false,
  isCommercialImport: true,
  withholdingApplicable: true,
  adjustmentReason: "",
  officerConfirmation: false,
});

function money(value: number | null | undefined, currency = "ETB") {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${currency} ${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function displayTaxName(name: string) {
  if (name === "VAT") return "Value Added Tax (VAT)";
  if (name === "Surtax") return "Import Surtax";
  return name;
}

function displayBasis(basis: string) {
  const normalized = basis.replaceAll("_", "").toUpperCase();
  if (normalized === "CIFPLUSDUTY") return "CIF + Duty";
  if (normalized === "CIFPLUSDUTYPLUSEXCISE") return "CIF + Duty + Excise";
  if (normalized === "CIFPLUSDUTYPLUSEXCISEPLUSSURTAX") return "CIF + Duty + Excise + Surtax";
  if (normalized === "UNITRATEETB") return "ETB rate × shipment quantity";
  if (normalized === "CIFPLUSDUTYPLUSVATPLUSEXCISE") return "CIF + Duty + Excise + VAT";
  return "CIF value";
}

function draftFromResponse(data: Phase2Response): Phase2Request {
  const phase = data.phase2;
  const carriedValue = phase1Value(data);
  if (!phase) return emptyDraft(carriedValue);

  // A draft created by an older client may have been saved with CIF = 0.
  // Recover the authoritative Phase 1 selected value instead of displaying
  // or submitting a zero assessment. A positive Phase 2 value remains the
  // officer's explicit Phase 2 value (including a documented conversion).
  const hasSavedCustomsValue = Number(phase.customsValueAmount) > 0;
  const customsValueAmount = hasSavedCustomsValue ? phase.customsValueAmount : carriedValue.amount;
  const customsValueCurrency = hasSavedCustomsValue
    ? phase.customsValueCurrency
    : carriedValue.amount > 0
      ? carriedValue.currency
      : phase.customsValueCurrency;
  const targetCurrency = hasSavedCustomsValue
    ? phase.targetCurrency
    : carriedValue.amount > 0
      ? carriedValue.currency
      : phase.targetCurrency;

  return {
    selectedHsCodeId: phase.selectedHsCodeId,
    targetCurrency,
    exchangeRate: hasSavedCustomsValue ? phase.exchangeRate : 1,
    exchangeRateSource: hasSavedCustomsValue ? phase.exchangeRateSource : carriedValue.amount > 0 ? "Phase 1 selected customs value" : phase.exchangeRateSource,
    exchangeRateDate: hasSavedCustomsValue ? phase.exchangeRateDate : null,
    exemptionAmount: phase.exemptionAmount,
    waiverAmount: phase.waiverAmount,
    manualAdjustmentAmount: phase.manualAdjustmentAmount,
    manualAdjustmentType: phase.manualAdjustmentType,
    notes: phase.notes,
    taxLines: ensurePermanentTaxLines(phase.taxLines.map(
      ({ id: _id, ...line }) => line as Phase2TaxLineRequest,
    )),
    customsValueAmount,
    customsValueCurrency,
    quantity: phase.quantity || 1,
    unit: phase.unit || "Pieces (PCS)",
    originCountry: phase.originCountry,
    productCategory: phase.productCategory,
    exemptionCodes: phase.exemptionCodes,
    originPreferenceClaimed: phase.originPreferenceClaimed,
    exciseTaxApplicable: phase.exciseTaxApplicable,
    isCommercialImport: phase.isCommercialImport,
    withholdingApplicable: phase.withholdingApplicable,
    adjustmentReason: phase.adjustmentReason,
    officerConfirmation: phase.officerConfirmed,
    expectedVersion: phase.version,
  };
}

function previewLines(lines: Phase2TaxLineRequest[], cif: number, quantity: number, currency: string) {
  let duty = 0;
  let excise = 0;
  let surtax = 0;
  let vat = 0;

  return [...lines].sort((a, b) => a.order - b.order).map((line) => {
    const basis = line.name === "Excise Tax"
      ? cif + duty
      : line.name === "Excise Tax (specific)"
        ? quantity
        : line.name === "Surtax"
          ? cif + duty + excise
          : line.name === "VAT"
            ? cif + duty + excise + surtax
            : cif;
    const serverAmountIsCurrent = line.status === "Recommended" &&
      line.calculatedAmount !== undefined && line.baseAmount === basis &&
      (line.recommendedValue === undefined || line.value === line.recommendedValue);
    const amount =
      line.status === "Pending" || line.status === "ReviewRequired" || line.isApplicable === false
        ? 0
        : line.calculationType === "PerUnit"
          ? currency === "ETB"
            ? Number(line.value) * quantity
            : serverAmountIsCurrent ? line.calculatedAmount ?? 0 : 0
        : line.name === "Excise Tax" && line.notes.includes("greater of") && serverAmountIsCurrent
          ? line.calculatedAmount ?? 0
        : line.calculationType === "Fixed"
          ? Number(line.value) || 0
          : (basis * (Number(line.value) || 0)) / 100;

    if (line.name === "Customs Duty") duty = amount;
    if (line.name === "Excise Tax") excise += amount;
    if (line.name === "Excise Tax (specific)") excise += amount;
    if (line.name === "Surtax") surtax = amount;
    if (line.name === "VAT") vat = amount;

    return { ...line, baseAmount: basis, calculatedAmount: amount };
  });
}

export function PhaseTwoOverview({ onBackToReview }: PhaseTwoOverviewProps) {
  const [decisionId, setDecisionId] = useState("");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Phase2Request>(emptyDraft());
  const [data, setData] = useState<Phase2Response | null>(null);
  const [hsResults, setHsResults] = useState<HsCode[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [showInputs, setShowInputs] = useState(false);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [newTaxName, setNewTaxName] = useState("");
  const [showNewTax, setShowNewTax] = useState(false);
  const [productImage, setProductImage] = useState<string | null>(null);

  // HS Code Editable & Search states
  const [hsCodeInput, setHsCodeInput] = useState("");
  const [systemRecommendedCode, setSystemRecommendedCode] = useState("");
  const [isManuallyOverridden, setIsManuallyOverridden] = useState(false);
  const [hsCodeError, setHsCodeError] = useState("");
  const [hsSuggestions, setHsSuggestions] = useState<HsCode[]>([]);
  const [showHsSuggestions, setShowHsSuggestions] = useState(false);

  // Description / Keyword Search bar states
  const [keywordQuery, setKeywordQuery] = useState("");
  const [keywordResults, setKeywordResults] = useState<HsCode[]>([]);
  const [showKeywordResults, setShowKeywordResults] = useState(false);
  const [isSearchingKeyword, setIsSearchingKeyword] = useState(false);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const phase = data?.phase2;
  const currency = draft.targetCurrency || "ETB";
  const remarksIssue = officerNoteIssue(draft.notes);
  const adjustmentNoteIssue = officerNoteIssue(draft.adjustmentReason);
  const noteIssue = remarksIssue ?? adjustmentNoteIssue;
  const selectedHs = useMemo(
    () => hsResults.find((item) => item.id === draft.selectedHsCodeId) ?? null,
    [hsResults, draft.selectedHsCodeId],
  );

  const rows = useMemo(
    () => previewLines(draft.taxLines, Number(draft.customsValueAmount) || 0, Number(draft.quantity) || 0, currency),
    [draft.taxLines, draft.customsValueAmount, draft.quantity, currency],
  );

  const totalTaxPreview = rows
    .filter((line) => line.isApplicable !== false)
    .reduce((sum, line) => sum + (line.calculatedAmount ?? 0), 0);

  const finalPreview = Math.max(
    0,
    (Number(draft.customsValueAmount) || 0) +
      totalTaxPreview -
      (Number(draft.exemptionAmount) || 0) -
      (Number(draft.waiverAmount) || 0) +
      (draft.manualAdjustmentType === "Percentage"
        ? ((Number(draft.customsValueAmount) || 0) *
            (Number(draft.manualAdjustmentAmount) || 0)) /
          100
        : Number(draft.manualAdjustmentAmount) || 0),
  );

  const unresolvedTax = draft.taxLines.some((line) => line.status === "ReviewRequired" || line.status === "Pending");
  const needsHsReview = !draft.selectedHsCodeId || selectedHs?.hsUpdateStatus === "MAPPING_CANDIDATE";
  const isRecommended = Boolean(
    !isManuallyOverridden &&
    systemRecommendedCode &&
    hsCodeInput &&
    hsCodeInput.replace(/\D/g, "") === systemRecommendedCode.replace(/\D/g, ""),
  );

  const hasAdjustments =
    isManuallyOverridden ||
    draft.exemptionAmount > 0 ||
    draft.waiverAmount > 0 ||
    draft.manualAdjustmentAmount !== 0 ||
    draft.originPreferenceClaimed ||
    draft.taxLines.some((line) => line.status === "OfficerAdjusted") ||
    unresolvedTax;

  const warning = warningDismissed
    ? ""
    : isManuallyOverridden
      ? "HS Code was manually overridden. You may add an optional audit note."
      : !draft.selectedHsCodeId
        ? "HS code was not confidently identified. Enter or search the correct tariff line."
        : unresolvedTax
          ? "Some taxes require manual rate selection or officer review."
          : "";

  useEffect(() => {
    const session = readValuationSession();
    if (!session) return;
    setQuery(session.query);
    setKeywordQuery(session.query);
    const firstImage = session.international?.items?.find((item) => item.thumbnailUrl)?.thumbnailUrl ?? null;
    if (firstImage) setProductImage(firstImage);
    if (session.decisionId) {
      setDecisionId(session.decisionId);
      void loadCase(session.decisionId, session.query);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCase(id = decisionId, searchTerm = query) {
    if (!id.trim()) {
      setError("Submit Price Review first, or enter a valuation decision ID.");
      return;
    }
    setBusy(true);
    setError("");
    setWarningDismissed(false);
    try {
      const response = await loadPhase2(id.trim());
      const nextDraft = draftFromResponse(response);

      if (searchTerm.trim()) {
        try {
          const matches = await searchPhase2HsCodes(searchTerm.trim());
          setHsResults(matches.items);

          const expectedCode = recommendedHsCode(searchTerm);
          const recommendation = expectedCode
            ? matches.items.find((item) => item.code?.replace(/\D/g, "") === expectedCode || item.tariffItemNo?.replace(/\D/g, "") === expectedCode)
            : matches.items.length === 1 ? matches.items[0] : null;

          const recCodeStr = recommendation ? displayHsCode(recommendation) : (expectedCode ?? "");
          setSystemRecommendedCode(recCodeStr);

          const savedItem = nextDraft.selectedHsCodeId
            ? matches.items.find((item) => item.id === nextDraft.selectedHsCodeId)
            : null;

          if (savedItem) {
            setHsCodeInput(displayHsCode(savedItem));
            const isDifferent = Boolean(recCodeStr && displayHsCode(savedItem).replace(/\D/g, "") !== recCodeStr.replace(/\D/g, ""));
            setIsManuallyOverridden(isDifferent);
            nextDraft.unit = exciseUnitFor(savedItem);
          } else if (recommendation) {
            setHsCodeInput(displayHsCode(recommendation));
            setIsManuallyOverridden(false);
            Object.assign(nextDraft, applyRecommendedRates(nextDraft, recommendation));
          } else if (recCodeStr) {
            setHsCodeInput(recCodeStr);
          }
        } catch {
          // Manual HS selection remains available
        }
      }

      setData(response);
      setDraft(nextDraft);
      setDecisionId(id.trim());
      if (nextDraft.selectedHsCodeId && nextDraft.customsValueAmount > 0 &&
          (!response.phase2?.taxLines?.length || response.phase2.selectedHsCodeId !== nextDraft.selectedHsCodeId)) {
        const calculated = await calculatePhase2(id.trim(), requestPayload(nextDraft));
        setData(calculated);
        setDraft(draftFromResponse(calculated));
      }
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "The assessment could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  /** Centralized HS code selection handler */
  function selectHsItem(item: HsCode, userInitiated = false) {
    setHsResults((prev) => {
      const exists = prev.some((x) => x.id === item.id);
      return exists ? prev : [item, ...prev];
    });

    const itemCode = displayHsCode(item);
    setHsCodeInput(itemCode);
    setHsCodeError("");
    setShowHsSuggestions(false);
    setShowKeywordResults(false);

    const nextDraft = applyRecommendedRates(draft, item);
    setDraft(nextDraft);

    if (decisionId && nextDraft.customsValueAmount > 0) {
      setBusy(true);
      setError("");
      void calculatePhase2(decisionId, requestPayload(nextDraft))
        .then((response) => {
          setData(response);
          setDraft(draftFromResponse(response));
          setNotice(`Tariff ${itemCode} selected. Duty and tax recommendations recalculated from the backend tariff and excise schedule.`);
        })
        .catch((exception) => setError(exception instanceof Error ? exception.message : "Tax recommendations could not be calculated."))
        .finally(() => setBusy(false));
    }

    if (userInitiated) {
      const cleanNew = itemCode.replace(/\D/g, "");
      const cleanRec = systemRecommendedCode.replace(/\D/g, "");
      const overridden = Boolean(cleanRec && cleanNew !== cleanRec);
      setIsManuallyOverridden(overridden);

      if (overridden && !draft.adjustmentReason) {
        update("adjustmentReason", `Officer selected HS ${itemCode} (${item.descriptionEn.slice(0, 60)}...) over recommended ${systemRecommendedCode}.`);
      }
      if (!(decisionId && nextDraft.customsValueAmount > 0)) setNotice(`Tariff line updated to ${itemCode}. Refresh the calculation to load current tax recommendations.`);
    }
  }

  /** Direct typing handler for the editable HS Code input field */
  function handleHsCodeInputChange(value: string) {
    setHsCodeInput(value);
    setHsCodeError("");

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    const term = value.trim();
    if (!term) {
      setHsSuggestions([]);
      setShowHsSuggestions(false);
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const result = await searchPhase2HsCodes(term);
        setHsSuggestions(result.items);
        setShowHsSuggestions(result.items.length > 0);

        const cleanVal = term.replace(/\D/g, "");
        const exactMatch = result.items.find(
          (m) =>
            m.code?.replace(/\D/g, "") === cleanVal ||
            m.tariffItemNo?.replace(/\D/g, "") === cleanVal ||
            displayHsCode(m).toLowerCase() === term.toLowerCase(),
        );

        if (exactMatch) {
          selectHsItem(exactMatch, true);
        } else if (result.items.length === 0 && cleanVal.length >= 4) {
          setHsCodeError(`Unrecognized HS Code "${term}" — not found in Ethiopian tariff database.`);
        }
      } catch {
        // Search error gracefully ignored during typing
      }
    }, 300);
  }

  /** Keyword / Description search handler */
  async function triggerKeywordSearch(keyword = keywordQuery) {
    const term = keyword.trim();
    if (!term) return;
    setIsSearchingKeyword(true);
    setError("");
    try {
      const result = await searchPhase2HsCodes(term);
      setKeywordResults(result.items);
      setShowKeywordResults(true);
      const expectedCode = recommendedHsCode(term);
      const recommendation = expectedCode
        ? result.items.find((item) => item.code?.replace(/\D/g, "") === expectedCode || item.tariffItemNo?.replace(/\D/g, "") === expectedCode)
        : result.items.length === 1 ? result.items[0] : null;
      if (recommendation) {
        setSystemRecommendedCode(displayHsCode(recommendation));
        setIsManuallyOverridden(false);
        selectHsItem(recommendation);
      }
      if (result.items.length === 0) {
        setNotice(`No tariff headings found matching "${term}". Try another keyword or code.`);
      }
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Keyword search failed.");
    } finally {
      setIsSearchingKeyword(false);
    }
  }

  function update<K extends keyof Phase2Request>(key: K, value: Phase2Request[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateLine(index: number, patch: Partial<Phase2TaxLineRequest>) {
    update("taxLines", draft.taxLines.map((line, itemIndex) => itemIndex === index ? { ...line, ...patch } : line));
  }

  function toggleLine(index: number) {
    const line = draft.taxLines[index];
    if (!line) return;
    updateLine(index, { isApplicable: line.isApplicable === false, status: "OfficerAdjusted" });
  }

  function removeLine(index: number) {
    const line = draft.taxLines[index];
    if (line && standardTaxNames.some((name) => name.toLowerCase() === line.name.toLowerCase())) {
      toggleLine(index);
      return;
    }
    update("taxLines", draft.taxLines.filter((_, itemIndex) => itemIndex !== index));
  }

  function toggleExemption(code: string) {
    update(
      "exemptionCodes",
      draft.exemptionCodes.includes(code)
        ? draft.exemptionCodes.filter((item) => item !== code)
        : [...draft.exemptionCodes, code],
    );
  }

  function addTax() {
    const name = newTaxName.trim();
    if (!name) return;
    if (standardTaxNames.some((standardName) => standardName.toLowerCase() === name.toLowerCase())) {
      setError(`${name} is already a required assessment row. Use its Apply toggle instead.`);
      setShowNewTax(false);
      return;
    }
    update("taxLines", [
      ...draft.taxLines,
      {
        name,
        calculationType: "Percentage",
        value: 0,
        currency,
        order: draft.taxLines.length + 1,
        calculationBasis: "CIF",
        notes: "Officer-entered tax; document the legal source in the remarks.",
        isApplicable: true,
        status: "OfficerAdjusted",
      },
    ]);
    setNewTaxName("");
    setShowNewTax(false);
  }

  function requestPayload(source: Phase2Request): Phase2Request {
    return {
      ...source,
      customsValueAmount: Number(source.customsValueAmount) || 0,
      quantity: Number(source.quantity) || 1,
      exchangeRate: Number(source.exchangeRate) || 1,
      exemptionAmount: Number(source.exemptionAmount) || 0,
      waiverAmount: Number(source.waiverAmount) || 0,
      manualAdjustmentAmount: Number(source.manualAdjustmentAmount) || 0,
      taxLines: source.taxLines.filter((line) => line.status !== "Pending" && line.status !== "ReviewRequired").map((line, index) => ({
        ...line,
        value: Number(line.value) || 0,
        order: index + 1,
        currency: line.currency || source.targetCurrency,
      })),
    };
  }

  function payload(): Phase2Request {
    return requestPayload(draft);
  }

  async function calculate() {
    if (!decisionId) {
      setError("Load a valuation decision before calculating.");
      return;
    }
    if (noteIssue) { setError(noteIssue); return; }
    setBusy(true);
    setError("");
    setNotice("");
    setWarningDismissed(false);
    try {
      const response = await calculatePhase2(decisionId, payload());
      setData(response);
      setDraft(draftFromResponse(response));
      setNotice("Default rates and assessment calculations refreshed.");
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "The assessment could not be calculated.");
    } finally {
      setBusy(false);
    }
  }

  async function openCustomerReceipt() {
    if (!decisionId) return;
    setReceiptBusy(true); setError("");
    try {
      const blob = await downloadPhase1Receipt(decisionId);
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = data?.phase1.receiptFileName || "customer-receipt"; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (ex) { setError(ex instanceof Error ? ex.message : "The customer receipt could not be opened."); }
    finally { setReceiptBusy(false); }
  }

  async function save(complete = false) {
    if (!decisionId) {
      setError("Load a valuation decision before saving.");
      return;
    }
    if (noteIssue) { setError(noteIssue); return; }
    if (complete) {
      if (!draft.officerConfirmation) {
        setError("Officer confirmation is required before completing the assessment.");
        return;
      }
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await savePhase2(decisionId, payload(), complete);
      setData(response);
      setDraft(draftFromResponse(response));
      setNotice(complete ? "Assessment confirmed and recorded in the official audit history." : "Assessment draft saved.");
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "The assessment could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setDraft(data ? draftFromResponse(data) : emptyDraft());
    setNotice("Assessment changes reset.");
  }

  const confirmDisabled = busy || !draft.officerConfirmation || Boolean(noteIssue);

  return (
    <div className="phase-two-workspace phase2-reference-workspace">
      <FeedbackToast
        error={error}
        warning={warning}
        success={notice}
        onDismissError={() => setError("")}
        onDismissWarning={() => setWarningDismissed(true)}
        onDismissSuccess={() => setNotice("")}
        onRetry={() => void loadCase()}
      />

      <header className="phase2-reference-heading">
        <div>
          <h1>Duty &amp; Tax Assessment</h1>
          <p>Calculate duties and taxes based on the approved value. You can adjust rates and make the final assessment.</p>
        </div>
        <div className="phase2-case-meta">
          <span>Case ID: {decisionId ? decisionId.slice(0, 14) : "—"}</span>
          <span>Date: {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        </div>
      </header>

      <nav className="phase-bar phase-bar--two" aria-label="Valuation phases">
        <button type="button" aria-pressed={false} className="is-collapsed" onClick={onBackToReview} disabled={!onBackToReview}>
          <span><FiCheckCircle /></span>
          <strong>Price Review</strong>
        </button>
        <FiChevronRight aria-hidden="true" />
        <button type="button" aria-pressed={true} className="is-active" aria-current="step">
          <span>02</span>
          <strong>Duty &amp; Tax Assessment</strong>
          <small>Calculate duties and taxes</small>
        </button>
      </nav>

      {/* Product & HS Code Card */}
      <section className="card phase2-product-card phase2-reference-card phase2-product-redesign">
        <div className="phase2-card-title">
          <h2>Product &amp; HS Code</h2>
          {systemRecommendedCode && (
            <span style={{ fontSize: "11px", color: "#64748b" }}>
              System recommendation: <strong style={{ color: "#1e40af" }}>{systemRecommendedCode}</strong>
            </span>
          )}
        </div>

        {/* Description & Keyword Search Bar */}
        <div className="phase2-search-strip">
          <div className="phase2-search-input-wrap">
            <FiSearch />
            <input
              type="text"
              className="phase2-search-input"
              placeholder="Search product description or keyword (e.g. iPhone 13, Cigar, Laptop, Tobacco)..."
              value={keywordQuery}
              onChange={(e) => {
                setKeywordQuery(e.target.value);
                void triggerKeywordSearch(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void triggerKeywordSearch();
                }
              }}
            />
            {keywordQuery && (
              <button
                type="button"
                className="phase2-search-clear"
                onClick={() => {
                  setKeywordQuery("");
                  setKeywordResults([]);
                  setShowKeywordResults(false);
                }}
                aria-label="Clear search"
              >
                <FiX />
              </button>
            )}
          </div>
          <button
            type="button"
            className="phase2-search-btn"
            onClick={() => void triggerKeywordSearch()}
            disabled={isSearchingKeyword}
          >
            <FiSearch /> {isSearchingKeyword ? "Searching…" : "Search Tariff"}
          </button>

          {/* Keyword Search Popover Results */}
          {showKeywordResults && keywordResults.length > 0 && (
            <div className="hs-suggestions-popover">
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 8px", fontSize: "10px", color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>
                <span>Matching Tariff Headings ({keywordResults.length})</span>
                <button type="button" onClick={() => setShowKeywordResults(false)} style={{ border: 0, background: "none", color: "#94a3b8", cursor: "pointer" }}><FiX /></button>
              </div>
              {keywordResults.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`hs-suggestion-item ${item.id === draft.selectedHsCodeId ? "is-selected" : ""}`}
                  onClick={() => selectHsItem(item, true)}
                >
                  <span className="hs-suggestion-code">{displayHsCode(item)}</span>
                  <span className="hs-suggestion-desc">{item.descriptionEn}</span>
                  {item.duty && <span className="hs-suggestion-duty">{item.duty} duty</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="product-hero">
          <div className="product-hero-image">
            {productImage ? (
              <img src={productImage} alt={query || "Product"} onError={() => setProductImage(null)} />
            ) : (
              <div className="product-hero-fallback"><FiBookOpen /></div>
            )}
          </div>

          <div className="product-hero-details">
            <div className="product-hero-name">
              <strong>{query || "Selected product"}</strong>
              <div
                className={`product-hero-badge ${
                  isManuallyOverridden
                    ? "product-hero-badge--overridden"
                    : isRecommended
                      ? "product-hero-badge--recommended"
                      : needsHsReview
                        ? "product-hero-badge--review"
                        : "product-hero-badge--good"
                }`}
              >
                {isManuallyOverridden ? (
                  <><FiEdit2 /> Officer Overridden</>
                ) : isRecommended ? (
                  <><FiCheck /> System Recommended</>
                ) : needsHsReview ? (
                  <><FiAlertCircle /> Manual review required</>
                ) : (
                  <><FiCheck /> Auto-detected</>
                )}
              </div>
            </div>

            <div className="product-hero-fields">
              {/* Interactive, editable HS Code Input */}
              <div className="product-hero-field">
                <label>HS Code</label>
                <div className="product-hero-hs-editable">
                  <div className="product-hero-hs-input-row">
                    <input
                      type="text"
                      className={`product-hero-hs-input ${
                        hsCodeError
                          ? "is-invalid"
                          : isManuallyOverridden
                            ? "is-overridden"
                            : isRecommended
                              ? "is-recommended"
                              : ""
                      }`}
                      value={hsCodeInput}
                      onChange={(e) => handleHsCodeInputChange(e.target.value)}
                      onFocus={() => {
                        if (hsSuggestions.length > 0) setShowHsSuggestions(true);
                      }}
                      onBlur={() => {
                        setTimeout(() => setShowHsSuggestions(false), 250);
                      }}
                      placeholder="e.g. 8517.1390"
                      aria-label="Editable HS Code"
                    />
                    <button
                      type="button"
                      title="Search tariff schedule"
                      onClick={() => {
                        setKeywordQuery(hsCodeInput || query);
                        void triggerKeywordSearch(hsCodeInput || query);
                      }}
                    >
                      <FiSearch />
                    </button>
                  </div>

                  {hsCodeError && <span className="hs-code-error-text">{hsCodeError}</span>}

                  {/* Autocomplete suggestions popover */}
                  {showHsSuggestions && hsSuggestions.length > 0 && (
                    <div className="hs-suggestions-popover">
                      {hsSuggestions.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`hs-suggestion-item ${item.id === draft.selectedHsCodeId ? "is-selected" : ""}`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectHsItem(item, true);
                          }}
                        >
                          <span className="hs-suggestion-code">{displayHsCode(item)}</span>
                          <span className="hs-suggestion-desc">{item.descriptionEn}</span>
                          {item.duty && <span className="hs-suggestion-duty">{item.duty}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Dynamic Tariff Description Field */}
              <div className="product-hero-field product-hero-field--wide">
                <label>Tariff description</label>
                <span className="product-hero-tariff">
                  {selectedHs?.descriptionEn ??
                    (draft.selectedHsCodeId
                      ? "Tariff description loaded for selected HS line."
                      : "No tariff line selected. Type an HS code or search keywords above.")}
                </span>
              </div>
            </div>
          </div>
        </div>

        {data?.phase1.declaredPriceAmount != null && <div className="phase2-receipt-evidence"><div><span>Customer invoice declaration</span><strong>{money(data.phase1.declaredPriceAmount, data.phase1.declaredPriceCurrency)}</strong><small>Original amount paid</small></div><div><span>Converted into Phase 1 currency</span><strong>{money(data.phase1.declaredPriceConvertedAmount, data.phase1.declaredPriceConvertedCurrency)}</strong><small>Rate {data.phase1.declaredPriceExchangeRate?.toLocaleString() ?? "—"} · {data.phase1.declaredPriceExchangeRateSource}</small></div><button className="secondary-button" type="button" onClick={() => void openCustomerReceipt()} disabled={!data.phase1.receiptFileName || receiptBusy}><FiFileText />{receiptBusy ? "Opening receipt…" : data.phase1.receiptFileName || "Receipt unavailable"}</button></div>}

        <div className="phase2-inputs-toggle">
          <button type="button" onClick={() => setShowInputs((value) => !value)} aria-expanded={showInputs}>
            <FiInfo /> Assessment inputs
            <span>{showInputs ? "Hide origin, category, and CIF" : "Show origin, category, and CIF"}</span>
          </button>
        </div>

        {showInputs && (
          <div className="phase2-context-grid">
            <label>
              Country of origin (optional)
              <input
                value={draft.originCountry}
                onChange={(event) => update("originCountry", event.target.value)}
                placeholder="e.g. China"
              />
            </label>
            <label>
              Product category
              <select
                value={draft.productCategory}
                onChange={(event) => update("productCategory", event.target.value)}
              >
                {categories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label>
              Unit
              <select value={draft.unit} onChange={(event) => update("unit", event.target.value)}>
                <option>Pieces (PCS)</option>
                <option>Kilograms (KG)</option>
                <option>Litres (L)</option>
                <option>Pack (20 sticks)</option>
                <option>Sets</option>
              </select>
            </label>
            <label>
              Quantity
              <input
                type="number"
                min="0"
                value={draft.quantity}
                onChange={(event) => update("quantity", Number(event.target.value))}
              />
            </label>
            <label>
              Customs value (CIF)
              <div className="currency-input">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.customsValueAmount}
                  onChange={(event) => update("customsValueAmount", Number(event.target.value))}
                />
                <span>{draft.customsValueCurrency}</span>
              </div>
            </label>
            <div className="phase2-exemptions">
              <span>Applicable exemptions</span>
              <div>
                {exemptionOptions.map(([code, label]) => (
                  <label key={code}>
                    <input
                      type="checkbox"
                      checked={draft.exemptionCodes.includes(code)}
                      onChange={() => toggleExemption(code)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Duties & Taxes Table & Summary */}
      <div className="phase2-dashboard-grid phase2-reference-grid">
        <main>
          <section className="card phase2-tax-card phase2-reference-card">
            <div className="phase2-card-title">
              <div>
                <h2>
                  Applicable Duties &amp; Taxes <FiInfo className="title-info" />
                </h2>
                <div className="inline-statuses">
                  <span className="status-pill status-pill--good">
                    <FiCheck /> Taxes auto-determined from HS code {hsCodeInput ? `(${hsCodeInput})` : ""}
                  </span>
                  {unresolvedTax && (
                    <span className="status-pill status-pill--warning">
                      <FiAlertCircle /> Tax requires manual selection
                    </span>
                  )}
                </div>
              </div>
              <button className="outline-action" type="button" onClick={() => void calculate()} disabled={busy}>
                <FiRefreshCw /> Refresh calculation
              </button>
            </div>

            <div className="tax-table-wrap">
              <table className="tax-table phase2-reference-tax-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Tax type</th>
                    <th>Rate (%) / unit</th>
                    <th>Basis</th>
                    <th>Amount ({currency})</th>
                    <th>Apply</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td className="tax-table-empty" colSpan={6}>
                        Load default rates to calculate the applicable taxes for this HS code.
                      </td>
                    </tr>
                  ) : (
                    rows.map((line, index) => (
                      <tr key={`${line.name}-${index}`} className={line.isApplicable === false ? "is-disabled" : ""}>
                        <td>{index + 1}</td>
                        <td>
                          <div className="tax-name">
                            <span className="drag-handle">⋮⋮</span>
                            <strong>{displayTaxName(line.name)}</strong>
                          </div>
                        </td>
                        <td>
                          <input
                            className="rate-input"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder={line.calculationType === "PerUnit" ? "ETB / unit" : line.name === "Excise Tax" ? "Variable" : undefined}
                            value={line.status === "Pending" || line.status === "ReviewRequired" ? "" : line.value}
                            onChange={(event) => updateLine(index, { value: Number(event.target.value), status: "OfficerAdjusted" })}
                            disabled={line.isApplicable === false}
                            aria-label={`${displayTaxName(line.name)} ${line.calculationType === "PerUnit" ? "rate per unit" : "rate"}`}
                          />
                        </td>
                        <td>{displayBasis(line.calculationBasis)}</td>
                        <td className="amount-cell">
                          {line.status === "Pending" || line.status === "ReviewRequired" || line.isApplicable === false ? "—" : money(line.calculatedAmount, currency)}
                        </td>
                        <td>
                          <button
                            className={`toggle ${line.isApplicable !== false ? "is-on" : ""}`}
                            type="button"
                            role="switch"
                            aria-checked={line.isApplicable !== false}
                            onClick={() => toggleLine(index)}
                            aria-label={`${line.isApplicable === false ? "Apply" : "Disable"} ${displayTaxName(line.name)}`}
                          >
                            <span />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="add-tax-row">
              {showNewTax ? (
                <div className="add-tax-form">
                  <input
                    autoFocus
                    value={newTaxName}
                    onChange={(event) => setNewTaxName(event.target.value)}
                    placeholder="New tax type"
                  />
                  <button type="button" onClick={addTax}>Add</button>
                  <button type="button" onClick={() => setShowNewTax(false)}><FiX /></button>
                </div>
              ) : (
                <button type="button" onClick={() => setShowNewTax(true)}>
                  <FiPlus /> Add tax type
                </button>
              )}
            </div>
          </section>

          <section className="card rules-card phase2-reference-card">
            <div>
              <FiBookOpen />
              <div>
                <h3>Rules &amp; References</h3>
                <ul>
                  <li>HS duty comes from the selected national tariff item. Excise unit rates use Directive 1007/2024 where the exact tariff item is covered.</li>
                  <li>Configured sequence: Duty → Excise → Surtax → VAT. The official customs simulator example applies VAT before Surtax; officers must verify which statutory basis governs before confirmation.</li>
                  <li>You can modify rates, disable a required tax, or add other applicable taxes.</li>
                  <li>Final assessment is subject to the officer&apos;s decision and supporting documents.</li>
                </ul>
              </div>
            </div>
            <a href="https://customs.erca.gov.et/taxation-simulation/?lang=en" target="_blank" rel="noreferrer">
              View legal references <FiChevronRight />
            </a>
          </section>
        </main>

        <aside className="phase2-right-rail">
          <section className="card calculation-card phase2-reference-card">
            <h2><span className="summary-icon">▦</span>Calculation Summary</h2>
            <div className="calculation-summary-list">
              <div className="calculation-summary-line calculation-summary-line--cif">
                <span>Customs Value (CIF)</span>
                <strong>{money(draft.customsValueAmount, draft.customsValueCurrency)}</strong>
              </div>
              {rows.map((line, index) => (
                <div className="calculation-summary-line" key={`${line.name}-summary-${index}`}>
                  <span>{displayTaxName(line.name)}</span>
                  <strong>
                    {line.status === "Pending" || line.isApplicable === false
                      ? "—"
                      : money(line.calculatedAmount, currency)}
                  </strong>
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    aria-label={`${line.isApplicable === false ? "Apply" : "Disable"} ${displayTaxName(line.name)}`}
                  >
                    <FiMinus />
                  </button>
                </div>
              ))}
              <div className="calculation-summary-line calculation-summary-line--total">
                <span>Total Duties &amp; Taxes</span>
                <strong>{money(phase?.totalTax ?? totalTaxPreview, currency)}</strong>
              </div>
              <div className="calculation-summary-line calculation-summary-line--payable">
                <span>Total Amount Payable</span>
                <strong>{money(phase?.finalPayableAmount ?? phase?.finalAmount ?? finalPreview, currency)}</strong>
              </div>
            </div>
          </section>

          <section className="card officer-card phase2-reference-card">
            <h2><span className="summary-icon"><FiBookOpen /></span>Officer Remarks</h2>
            <label>
              Remarks <span>(optional)</span>
              <textarea
                maxLength={500}
                rows={4}
                aria-invalid={Boolean(remarksIssue)}
                value={draft.notes}
                onChange={(event) => update("notes", event.target.value)}
                placeholder="Add your remarks, justification or adjustments..."
              />
              <small>{draft.notes.length}/500</small>
              {remarksIssue && <small className="field-validation-error" role="alert">{remarksIssue}</small>}
            </label>

            {hasAdjustments && (
              <label className="reason-label">
                Adjustment note <span>(optional)</span>
                {isManuallyOverridden && (
                  <div className="reason-required-alert">
                    <FiAlertCircle style={{ marginRight: "4px", verticalAlign: "middle" }} />
                    HS Code was manually changed from{" "}
                    <strong>{systemRecommendedCode || "system recommendation"}</strong> to{" "}
                    <strong>{hsCodeInput}</strong>.
                  </div>
                )}
                <textarea
                  maxLength={500}
                  rows={3}
                  aria-invalid={Boolean(adjustmentNoteIssue)}
                  value={draft.adjustmentReason}
                  onChange={(event) => update("adjustmentReason", event.target.value)}
                  placeholder="Explain why the HS code or rates were adjusted from system recommendations..."
                />
                {adjustmentNoteIssue && <small className="field-validation-error" role="alert">{adjustmentNoteIssue}</small>}
              </label>
            )}

            <div className="decision-actions">
              <button className="reset-button" type="button" onClick={reset}><FiRefreshCw /> Reset</button>
              <button className="save-button" type="button" onClick={() => void save(false)} disabled={busy || Boolean(noteIssue)}><FiSave /> Save Draft</button>
            </div>

            <label className="confirm-check">
              <input
                type="checkbox"
                checked={draft.officerConfirmation}
                onChange={(event) => update("officerConfirmation", event.target.checked)}
              />
              I have reviewed the recommended calculation and supporting references.
            </label>

            <button
              className="confirm-button"
              type="button"
              onClick={() => void save(true)}
              disabled={confirmDisabled}
            >
              <FiCheckCircle /> Confirm Assessment
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
