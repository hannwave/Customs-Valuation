"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  FiAlertCircle,
  FiBookOpen,
  FiCheck,
  FiCheckCircle,
  FiChevronRight,
  FiEdit2,
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

/** Product-specific tax rate schedules keyed by HS code prefix. */
const taxRateSchedules: Record<string, Record<string, { rate: number; calculationType: "Percentage" | "Fixed"; exciseApplicable: boolean; category: string }>> = {
  // Cigars – HS 2402.10
  "240210": {
    "Customs Duty": { rate: 35, calculationType: "Percentage", exciseApplicable: true, category: "Tobacco" },
    "Excise Tax": { rate: 30, calculationType: "Percentage", exciseApplicable: true, category: "Tobacco" },
    "VAT": { rate: 15, calculationType: "Percentage", exciseApplicable: true, category: "Tobacco" },
    "Surtax": { rate: 10, calculationType: "Percentage", exciseApplicable: true, category: "Tobacco" },
    "Withholding Tax": { rate: 3, calculationType: "Percentage", exciseApplicable: true, category: "Tobacco" },
    "Social Welfare Levy": { rate: 3, calculationType: "Percentage", exciseApplicable: true, category: "Tobacco" },
  },
  // Cigarettes – HS 2402.20 (same rates as cigars)
  "240220": {
    "Customs Duty": { rate: 35, calculationType: "Percentage", exciseApplicable: true, category: "Tobacco" },
    "Excise Tax": { rate: 30, calculationType: "Percentage", exciseApplicable: true, category: "Tobacco" },
    "VAT": { rate: 15, calculationType: "Percentage", exciseApplicable: true, category: "Tobacco" },
    "Surtax": { rate: 10, calculationType: "Percentage", exciseApplicable: true, category: "Tobacco" },
    "Withholding Tax": { rate: 3, calculationType: "Percentage", exciseApplicable: true, category: "Tobacco" },
    "Social Welfare Levy": { rate: 3, calculationType: "Percentage", exciseApplicable: true, category: "Tobacco" },
  },
  // iPhones / Smartphones – HS 8517.13
  "851713": {
    "Customs Duty": { rate: 15, calculationType: "Percentage", exciseApplicable: false, category: "General goods" },
    "Excise Tax": { rate: 0, calculationType: "Percentage", exciseApplicable: false, category: "General goods" },
    "VAT": { rate: 15, calculationType: "Percentage", exciseApplicable: false, category: "General goods" },
    "Surtax": { rate: 10, calculationType: "Percentage", exciseApplicable: false, category: "General goods" },
    "Withholding Tax": { rate: 3, calculationType: "Percentage", exciseApplicable: false, category: "General goods" },
    "Social Welfare Levy": { rate: 0, calculationType: "Percentage", exciseApplicable: false, category: "General goods" },
  },
  // Laptops / Notebooks – HS 8471.30
  "847130": {
    "Customs Duty": { rate: 10, calculationType: "Percentage", exciseApplicable: false, category: "Capital goods" },
    "Excise Tax": { rate: 0, calculationType: "Percentage", exciseApplicable: false, category: "Capital goods" },
    "VAT": { rate: 15, calculationType: "Percentage", exciseApplicable: false, category: "Capital goods" },
    "Surtax": { rate: 0, calculationType: "Percentage", exciseApplicable: false, category: "Capital goods" },
    "Withholding Tax": { rate: 3, calculationType: "Percentage", exciseApplicable: false, category: "Capital goods" },
    "Social Welfare Levy": { rate: 3, calculationType: "Percentage", exciseApplicable: false, category: "Capital goods" },
  },
  // Motor Vehicles – HS 8703.23
  "870323": {
    "Customs Duty": { rate: 35, calculationType: "Percentage", exciseApplicable: true, category: "Motor vehicle" },
    "Excise Tax": { rate: 30, calculationType: "Percentage", exciseApplicable: true, category: "Motor vehicle" },
    "VAT": { rate: 15, calculationType: "Percentage", exciseApplicable: true, category: "Motor vehicle" },
    "Surtax": { rate: 10, calculationType: "Percentage", exciseApplicable: true, category: "Motor vehicle" },
    "Withholding Tax": { rate: 3, calculationType: "Percentage", exciseApplicable: true, category: "Motor vehicle" },
    "Social Welfare Levy": { rate: 3, calculationType: "Percentage", exciseApplicable: true, category: "Motor vehicle" },
  },
};

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

/** Apply recommended tax rates to the draft's tax lines based on the detected HS code and tariff duty. */
function applyRecommendedRates(draft: Phase2Request, hsCode: string | null, dutyRateFromTariff?: string | null): Phase2Request {
  if (!hsCode) return draft;
  const clean = hsCode.replace(/\D/g, "");
  const prefix6 = clean.slice(0, 6);
  const schedule = taxRateSchedules[prefix6] ?? taxRateSchedules[clean];

  if (schedule) {
    const firstEntry = Object.values(schedule)[0];
    const updatedLines = draft.taxLines.map((line) => {
      const match = schedule[line.name];
      if (!match) return line;
      return {
        ...line,
        calculationType: match.calculationType,
        value: match.rate,
        isApplicable: match.rate > 0,
        status: "Recommended" as const,
        notes: `Auto-applied ${match.rate}${match.calculationType === "Percentage" ? "%" : " ETB"} based on HS ${hsCode}.`,
      };
    });

    return {
      ...draft,
      taxLines: updatedLines,
      productCategory: firstEntry?.category ?? draft.productCategory,
      exciseTaxApplicable: firstEntry?.exciseApplicable ?? draft.exciseTaxApplicable,
    };
  }

  // Fallback: apply duty from tariff record if numeric (e.g. "10%", "35%")
  if (dutyRateFromTariff) {
    const numericDuty = parseFloat(dutyRateFromTariff.replace("%", "").trim());
    if (!isNaN(numericDuty)) {
      const surtaxApplies = numericDuty > 15;
      const updatedLines = draft.taxLines.map((line) => {
        if (line.name === "Customs Duty") {
          return {
            ...line,
            value: numericDuty,
            isApplicable: numericDuty > 0,
            status: "Recommended" as const,
            notes: `Auto-applied ${numericDuty}% customs duty from tariff record.`,
          };
        }
        if (line.name === "Surtax") {
          return {
            ...line,
            value: surtaxApplies ? 10 : 0,
            isApplicable: surtaxApplies,
            status: surtaxApplies ? ("Recommended" as const) : ("NotApplicable" as const),
            notes: surtaxApplies ? "10% import surtax applies because duty exceeds 15%." : "Not applied (duty <= 15%).",
          };
        }
        return line;
      });
      return { ...draft, taxLines: updatedLines };
    }
  }

  return draft;
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
  { name: "Customs Duty", calculationBasis: "CIF" },
  { name: "Excise Tax", calculationBasis: "CIF_PLUS_DUTY" },
  { name: "VAT", calculationBasis: "CIF_PLUS_DUTY_PLUS_EXCISE" },
  { name: "Surtax", calculationBasis: "CIF_PLUS_DUTY_PLUS_VAT_PLUS_EXCISE" },
  { name: "Withholding Tax", calculationBasis: "CIF" },
  { name: "Social Welfare Levy", calculationBasis: "CIF" },
] as const;

const standardTaxNames: string[] = permanentTaxDefinitions.map((line) => line.name);

function pendingTaxLines(): Phase2TaxLineRequest[] {
  return permanentTaxDefinitions.map((line, index) => ({
    name: line.name,
    calculationType: "Percentage",
    value: 0,
    currency: "ETB",
    order: index + 1,
    calculationBasis: line.calculationBasis,
    notes: "Load the recommended rate before completing this assessment.",
    isApplicable: true,
    status: "Pending",
  }));
}

function ensurePermanentTaxLines(lines: Phase2TaxLineRequest[]) {
  const byName = new Map(lines.map((line) => [line.name.toLowerCase(), line]));
  const permanent = permanentTaxDefinitions.map((definition, index) =>
    byName.get(definition.name.toLowerCase()) ?? {
      name: definition.name,
      calculationType: "Percentage" as const,
      value: 0,
      currency: "ETB",
      order: index + 1,
      calculationBasis: definition.calculationBasis,
      notes: "Load the recommended rate before completing this assessment.",
      isApplicable: true,
      status: "Pending" as const,
    },
  );
  const extras = lines.filter(
    (line) => !permanentTaxDefinitions.some((d) => d.name.toLowerCase() === line.name.toLowerCase()),
  );
  return [...permanent, ...extras].map((line, index) => ({ ...line, order: index + 1 }));
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
  if (basis === "CIF_PLUS_DUTY") return "CIF + Duty";
  if (basis === "CIF_PLUS_DUTY_PLUS_EXCISE") return "CIF + Duty + Excise";
  if (basis === "CIF_PLUS_DUTY_PLUS_VAT_PLUS_EXCISE") return "CIF + Duty + Excise + VAT";
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
      ({ id: _id, baseAmount: _base, calculatedAmount: _calculated, ...line }) =>
        line as Phase2TaxLineRequest,
    )),
    customsValueAmount,
    customsValueCurrency,
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

function previewLines(lines: Phase2TaxLineRequest[], cif: number) {
  let duty = 0;
  let excise = 0;
  let vat = 0;

  return lines.map((line) => {
    const base =
      line.calculationBasis === "CIF_PLUS_DUTY"
        ? cif + duty
        : line.calculationBasis === "CIF_PLUS_DUTY_PLUS_EXCISE"
          ? cif + duty + excise
          : line.calculationBasis === "CIF_PLUS_DUTY_PLUS_VAT_PLUS_EXCISE"
            ? cif + duty + excise + vat
            : cif;
    const amount =
      line.status === "Pending" || line.isApplicable === false
        ? 0
        : line.calculationType === "Fixed"
          ? Number(line.value) || 0
          : (base * (Number(line.value) || 0)) / 100;

    if (line.name === "Customs Duty") duty = amount;
    if (line.name === "Excise Tax") excise = amount;
    if (line.name === "VAT") vat = amount;

    return { ...line, baseAmount: base, calculatedAmount: amount };
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
  const [showInputs, setShowInputs] = useState(false);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [newTaxName, setNewTaxName] = useState("");
  const [showNewTax, setShowNewTax] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("Pieces (PCS)");
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
  const selectedHs = useMemo(
    () => hsResults.find((item) => item.id === draft.selectedHsCodeId) ?? null,
    [hsResults, draft.selectedHsCodeId],
  );

  const rows = useMemo(
    () => previewLines(draft.taxLines, Number(draft.customsValueAmount) || 0),
    [draft.taxLines, draft.customsValueAmount],
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

  const requiresReason =
    isManuallyOverridden ||
    draft.exemptionAmount > 0 ||
    draft.waiverAmount > 0 ||
    draft.manualAdjustmentAmount !== 0 ||
    draft.taxLines.some((line) => line.status === "OfficerAdjusted") ||
    unresolvedTax;

  const warning = warningDismissed
    ? ""
    : isManuallyOverridden
      ? "HS Code was manually overridden. Provide an Officer Adjustment Reason."
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
            Object.assign(nextDraft, applyRecommendedRates(nextDraft, savedItem.code, savedItem.duty));
          } else if (recommendation) {
            nextDraft.selectedHsCodeId = recommendation.id;
            setHsCodeInput(displayHsCode(recommendation));
            setIsManuallyOverridden(false);
            Object.assign(nextDraft, applyRecommendedRates(nextDraft, recommendation.code, recommendation.duty));
          } else if (recCodeStr) {
            setHsCodeInput(recCodeStr);
            Object.assign(nextDraft, applyRecommendedRates(nextDraft, recCodeStr));
          }
        } catch {
          // Manual HS selection remains available
        }
      }

      setData(response);
      setDraft(nextDraft);
      setDecisionId(id.trim());
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

    setDraft((current) => {
      const next = applyRecommendedRates(
        { ...current, selectedHsCodeId: item.id },
        item.code,
        item.duty,
      );
      return next;
    });

    if (userInitiated) {
      const cleanNew = itemCode.replace(/\D/g, "");
      const cleanRec = systemRecommendedCode.replace(/\D/g, "");
      const overridden = Boolean(cleanRec && cleanNew !== cleanRec);
      setIsManuallyOverridden(overridden);

      if (overridden && !draft.adjustmentReason) {
        update("adjustmentReason", `Officer selected HS ${itemCode} (${item.descriptionEn.slice(0, 60)}...) over recommended ${systemRecommendedCode}.`);
      }
      setNotice(`Tariff line updated to ${itemCode}. Applicable duties and taxes recalculated.`);
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

  function payload(): Phase2Request {
    return {
      ...draft,
      customsValueAmount: Number(draft.customsValueAmount) || 0,
      exchangeRate: Number(draft.exchangeRate) || 1,
      exemptionAmount: Number(draft.exemptionAmount) || 0,
      waiverAmount: Number(draft.waiverAmount) || 0,
      manualAdjustmentAmount: Number(draft.manualAdjustmentAmount) || 0,
      taxLines: draft.taxLines.filter((line) => line.status !== "Pending" && line.status !== "ReviewRequired").map((line, index) => ({
        ...line,
        value: Number(line.value) || 0,
        order: index + 1,
        currency: line.currency || currency,
      })),
    };
  }

  async function calculate() {
    if (!decisionId) {
      setError("Load a valuation decision before calculating.");
      return;
    }
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

  async function save(complete = false) {
    if (!decisionId) {
      setError("Load a valuation decision before saving.");
      return;
    }
    if (complete) {
      if (!draft.officerConfirmation) {
        setError("Officer confirmation is required before completing the assessment.");
        return;
      }
      if (isManuallyOverridden && (!draft.adjustmentReason || draft.adjustmentReason.trim().length < 5)) {
        setError(`Officer Adjustment Reason is required because the HS code was changed from recommended ${systemRecommendedCode || "system recommendation"} to ${hsCodeInput}.`);
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

  const confirmDisabled =
    busy ||
    !draft.officerConfirmation ||
    (isManuallyOverridden && (!draft.adjustmentReason || draft.adjustmentReason.trim().length < 5));

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

        <div className="phase2-inputs-toggle">
          <button type="button" onClick={() => setShowInputs((value) => !value)} aria-expanded={showInputs}>
            <FiInfo /> Assessment inputs
            <span>{showInputs ? "Hide origin, category, and CIF" : "Show origin, category, and CIF"}</span>
          </button>
        </div>

        {showInputs && (
          <div className="phase2-context-grid">
            <label>
              Country of origin
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
              <select value={unit} onChange={(event) => setUnit(event.target.value)}>
                <option>Pieces (PCS)</option>
                <option>Kilograms (KG)</option>
                <option>Litres (L)</option>
                <option>Sets</option>
              </select>
            </label>
            <label>
              Quantity
              <input
                type="number"
                min="0"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
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
                    <th>Rate (%)</th>
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
                            placeholder={line.name === "Excise Tax" ? "Variable" : undefined}
                            value={line.status === "Pending" || line.status === "ReviewRequired" ? "" : line.value}
                            onChange={(event) => updateLine(index, { value: Number(event.target.value), status: "OfficerAdjusted" })}
                            disabled={line.isApplicable === false}
                            aria-label={`${displayTaxName(line.name)} rate`}
                          />
                        </td>
                        <td>{displayBasis(line.calculationBasis)}</td>
                        <td className="amount-cell">
                          {line.status === "Pending" || line.isApplicable === false ? "—" : money(line.calculatedAmount, currency)}
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
                  <li>Rates are based on the current Ethiopian tariff and tax proclamations.</li>
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
                value={draft.notes}
                onChange={(event) => update("notes", event.target.value)}
                placeholder="Add your remarks, justification or adjustments..."
              />
              <small>{draft.notes.length}/500</small>
            </label>

            {requiresReason && (
              <label className="reason-label">
                Adjustment reason <em>required</em>
                {isManuallyOverridden && (
                  <div className="reason-required-alert">
                    <FiAlertCircle style={{ marginRight: "4px", verticalAlign: "middle" }} />
                    Officer justification is required: HS Code was manually changed from{" "}
                    <strong>{systemRecommendedCode || "system recommendation"}</strong> to{" "}
                    <strong>{hsCodeInput}</strong>.
                  </div>
                )}
                <textarea
                  rows={3}
                  value={draft.adjustmentReason}
                  onChange={(event) => update("adjustmentReason", event.target.value)}
                  placeholder="Explain why the HS code or rates were adjusted from system recommendations..."
                />
              </label>
            )}

            <div className="decision-actions">
              <button className="reset-button" type="button" onClick={reset}><FiRefreshCw /> Reset</button>
              <button className="save-button" type="button" onClick={() => void save(false)} disabled={busy}><FiSave /> Save Draft</button>
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
            {isManuallyOverridden && (!draft.adjustmentReason || draft.adjustmentReason.trim().length < 5) && (
              <small style={{ color: "#dc2626", fontSize: "10px", marginTop: "4px", display: "block", textAlign: "center" }}>
                Officer justification required before confirming a manually overridden HS code.
              </small>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
