export type PricePool = "International" | "Local" | "HistoricalCustoms";
export interface HsCode { id: string; revisionId: string; code: string; descriptionEn: string; descriptionAm: string | null; duty: string | null }
export interface HsRevision { id: string; name: string; number: number; effectiveDate: string; endDate: string | null; status: string }
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
export interface InternationalPriceSync extends InternationalPriceSearch {
  hsCodeId: string;
  hsCode: string;
  hsDescription: string;
  savedCount: number;
  updatedCount: number;
  skippedCount: number;
}
export interface LocalMarketOffer {
  source: string;
  title: string;
  description: string | null;
  price: number;
  currency: string;
  productUrl: string;
  thumbnailUrl: string | null;
  location: string | null;
  condition: string | null;
  sourceListingId: string;
  sellerName: string | null;
  listingDate: string | null;
  rawCategory: string | null;
}
export interface LocalMarketSourceStatus {
  id: "jiji" | "ethioshop" | "telegebeya";
  name: string;
  status: "Available" | "Unavailable" | "PartnerAccessRequired";
  resultCount: number;
  message: string | null;
  websiteUrl: string;
}
export interface LocalMarketPriceSearch {
  query: string;
  retrievedAt: string;
  items: LocalMarketOffer[];
  sources: LocalMarketSourceStatus[];
  statistics: PriceStatistics | null;
}
export interface LocalMarketPriceSync extends LocalMarketPriceSearch {
  hsCodeId: string;
  hsCode: string;
  hsDescription: string;
  savedCount: number;
  updatedCount: number;
  skippedCount: number;
}
export type LocalObservationStatus =
  | "Raw" | "Processing" | "ValidForStatistics" | "RejectedIrrelevant" | "WrongBrand"
  | "WrongModel" | "WrongVariant" | "IncompatibleCondition" | "IncompatibleUnit"
  | "InvalidPrice" | "Duplicate" | "PotentialOutlier" | "ManuallyApproved" | "ManuallyRejected";
export interface ClassifiedLocalListing {
  id: string;
  listing: {
    source: string; sourceListingId: string; url: string; title: string; description: string | null;
    seller: string | null; location: string | null; price: number; currency: string;
    retrievedAt: string; listingDate: string | null; imageUrl: string | null; rawCategory: string | null;
    condition: "New" | "Used" | "Refurbished" | "Unknown";
    priceType: "Retail" | "Wholesale" | "Distributor" | "Manufacturer" | "SupplierQuotation" | "Unknown";
  };
  relevanceScore: number;
  status: LocalObservationStatus;
  reason: string;
  matchedKeywords: string[];
  excludedKeywords: string[];
  originalQuantity: number;
  originalUnit: string;
  normalizedQuantity: number;
  normalizedUnit: string;
  normalizedUnitPrice: number | null;
  duplicateOfId: string | null;
  isPotentialOutlier: boolean;
  outlierScore: number | null;
  outlierReason: string | null;
  includedInStatistics: boolean;
}
export interface LocalAnalysisStatistics {
  count: number; minimum: number; maximum: number; mean: number; median: number;
  populationStandardDeviation: number; q1: number; q3: number; iqr: number;
  oldestObservation: string; newestObservation: string;
}
export interface LocalMarketAnalysisResponse {
  hsCodeId: string;
  hsCode: string;
  hsDescription: string;
  sources: LocalMarketSourceStatus[];
  analysis: {
    product: {
      hsCode: string; query: string; category: string | null; productType: string | null;
      brand: string | null; model: string | null; variant: string | null;
      condition: string; unit: string; priceType: string;
    };
    collection: {
      rawListings: number; validObservations: number; rejectedIrrelevant: number;
      wrongBrand: number; wrongModel: number; wrongVariant: number;
      incompatibleCondition: number; incompatibleUnit: number; invalidPrice: number;
      duplicates: number; potentialOutliers: number; excluded: number;
    };
    statisticsIncludingOutliers: LocalAnalysisStatistics | null;
    robustStatistics: LocalAnalysisStatistics | null;
    representativePrice: { value: number | null; method: string; currency: string; comparableListings: number; excludesOutliers: boolean };
    confidence: {
      score: number; level: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT_DATA";
      factors: { name: string; score: number; maximum: number; explanation: string }[];
      disclaimer: string;
    };
    observations: ClassifiedLocalListing[];
    outlierMethod: "Iqr" | "Mad" | "None";
    relevanceThreshold: number;
  };
}
export interface LocalMarketSyncResponse {
  result: LocalMarketAnalysisResponse;
  savedCount: number;
  updatedCount: number;
  skippedCount: number;
}

export type Phase2Status = "InProgress" | "Completed" | "RequiresReview";
export type Phase2CalculationType = "Percentage" | "Fixed";

export interface Phase2TaxLine {
  id: string;
  name: string;
  calculationType: Phase2CalculationType;
  value: number;
  currency: string;
  order: number;
  calculationBasis: string;
  baseAmount: number;
  calculatedAmount: number;
  notes: string;
}

export interface Phase2Response {
  decisionId: string;
  phase1: {
    hsCodeId: string;
    initialDuty: number;
    initialDutyCurrency: string;
    source: string;
  };
  phase2: {
    id: string;
    status: Phase2Status;
    originalHsCodeId: string;
    selectedHsCodeId: string | null;
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
  expectedVersion?: string;
}
