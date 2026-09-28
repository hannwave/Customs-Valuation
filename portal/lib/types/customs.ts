export type PricePool = "International" | "HistoricalCustoms";
export interface HsCodeCandidate { hsCode: string; description: string }
export interface HsCode { id: string; revisionId: string; code: string | null; descriptionEn: string; descriptionAm: string | null; duty: string | null; tariffItemNo?: string | null; unit?: string; sectionNumber?: string; sectionName?: string; chapterNumber?: number | null; chapterName?: string; headingNumber?: string; hsUpdateStatus?: string | null; hsUpdateNote?: string | null; hsUpdateCandidates?: HsCodeCandidate[] | null }
export interface HsRevision { id: string; name: string; number: number; effectiveDate: string; endDate: string | null; status: string; originalHsVersion?: string; updatedHsVersion?: string; totalRecords?: number }
export interface PagedResult<T> { items: T[]; totalCount: number; page: number; pageSize: number }
export interface PriceOutlier {
  title: string;
  source: string;
  price: number;
  direction: "Low" | "High";
}
export interface PriceStatistics {
  observationCount: number;
  minimum: number;
  maximum: number;
  mean: number;
  median: number;
  standardDeviation: number;
  percentiles: { p25: number; p50: number; p75: number };
  potentialOutliers: PriceOutlier[];
}
export interface InternationalMarketPrice {
  position: number | null;
  title: string;
  source: string;
  displayPrice: string;
  extractedPrice: number | null;
  productUrl: string | null;
  thumbnailUrl: string | null;
  rating: number | null;
  reviews: number | null;
  delivery: string | null;
  condition: string | null;
}
export interface InternationalPriceSearch {
  query: string;
  market: string;
  retrievedAt: string;
  items: InternationalMarketPrice[];
  statistics: PriceStatistics | null;
}
export interface ManufacturerPriceOffer {
  title: string;
  manufacturerDomain: string;
  productUrl: string;
  price: number | null;
  currency: string | null;
  evidenceSource: string;
}
export interface ManufacturerPriceSearch {
  query: string;
  market: string;
  manufacturerDomain: string | null;
  retrievedAt: string;
  status: "found" | "no_price" | "site_required";
  message: string;
  items: ManufacturerPriceOffer[];
}
export interface CustomsTradeBenchmark {
  hsCode: string;
  period: number | null;
  reporter: string;
  currency: "USD";
  unit: string | null;
  tradeValue: number | null;
  quantity: number | null;
  unitValue: number | null;
  sourceUrl: string | null;
  message: string;
  // Optional for valuation sessions saved before provenance was introduced.
  isMirror?: boolean;
  sourceLabel?: string;
  valuationBasis?: "CIF" | "FOB" | "Reported trade value" | null;
  reporters?: { code: number; name: string }[];
  reporterCount?: number;
  quantityEstimated?: boolean;
}
export interface InternationalPriceSync extends InternationalPriceSearch {
  hsCodeId: string;
  hsCode: string;
  hsDescription: string;
  savedCount: number;
  updatedCount: number;
  skippedCount: number;
}
export type Phase2Status = "InProgress" | "Completed" | "RequiresReview";
export type Phase2CalculationType = "Percentage" | "Fixed" | "PerUnit";

export interface Phase2TaxLine {
  id: string;
  name: string;
  calculationType: Phase2CalculationType;
  value: number;
  currency: string;
  order: number;
  calculationBasis: string;
  recommendedValue: number;
  baseAmount: number;
  calculatedAmount: number;
  notes: string;
  status: "Recommended" | "OfficerAdjusted" | "NotApplicable" | "ReviewRequired" | string;
  sourceReference: string;
  isApplicable: boolean;
}

export interface Phase2Response {
  decisionId: string;
  phase1: {
    hsCodeId: string | null;
    initialDuty: number;
    initialDutyCurrency: string;
    source: string;
    declaredPriceAmount: number | null;
    declaredPriceCurrency: string;
    declaredPriceConvertedAmount: number | null;
    declaredPriceConvertedCurrency: string;
    declaredPriceExchangeRate: number | null;
    declaredPriceExchangeRateSource: string;
    declaredPriceExchangeRateDate: string | null;
    receiptFileName: string;
    receiptContentType: string;
    receiptFileSize: number | null;
    receiptSha256: string;
    receiptUploadedAt: string | null;
  };
  phase2: {
    id: string;
    status: Phase2Status;
    originalHsCodeId: string | null;
    selectedHsCodeId: string | null;
    customsValueAmount: number;
    customsValueCurrency: string;
    quantity: number;
    unit: string;
    originCountry: string;
    productCategory: string;
    exemptionCodes: string[];
    originPreferenceClaimed: boolean;
    exciseTaxApplicable: boolean;
    isCommercialImport: boolean;
    withholdingApplicable: boolean;
    adjustmentReason: string;
    officerConfirmed: boolean;
    initialDutyAmount: number;
    initialDutyCurrency: string;
    targetCurrency: string;
    exchangeRate: number;
    exchangeRateSource: string;
    exchangeRateDate: string | null;
    exemptionAmount: number;
    waiverAmount: number;
    manualAdjustmentAmount: number;
    manualAdjustmentType: "Fixed" | "Percentage";
    notes: string;
    totalAdditionalTax: number;
    totalTax: number;
    finalPayableAmount: number;
    finalAmount: number;
    calculationRuleVersion: string;
    calculatedAt: string | null;
    version: string;
    taxLines: Phase2TaxLine[];
  } | null;
}

export interface Phase2TaxLineRequest {
  name: string;
  calculationType: Phase2CalculationType;
  value: number;
  currency: string;
  order: number;
  calculationBasis: string;
  notes: string;
  recommendedValue?: number;
  baseAmount?: number;
  calculatedAmount?: number;
  status?: string;
  sourceReference?: string;
  isApplicable?: boolean;
}

export interface Phase2Request {
  selectedHsCodeId: string | null;
  targetCurrency: string;
  exchangeRate: number;
  exchangeRateSource: string;
  exchangeRateDate: string | null;
  exemptionAmount: number;
  waiverAmount: number;
  manualAdjustmentAmount: number;
  manualAdjustmentType: "Fixed" | "Percentage";
  notes: string;
  taxLines: Phase2TaxLineRequest[];
  customsValueAmount: number;
  customsValueCurrency: string;
  quantity: number;
  unit: string;
  originCountry: string;
  productCategory: string;
  exemptionCodes: string[];
  originPreferenceClaimed: boolean;
  exciseTaxApplicable: boolean;
  isCommercialImport: boolean;
  withholdingApplicable: boolean;
  adjustmentReason: string;
  officerConfirmation: boolean;
  expectedVersion?: string;
}
