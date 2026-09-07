CREATE TABLE audit_logs (
    "Id" uuid NOT NULL,
    "UserId" text NOT NULL,
    "Username" text NOT NULL,
    "OccurredAt" timestamp with time zone NOT NULL,
    "Action" text NOT NULL,
    "Module" text NOT NULL,
    "RecordId" uuid NOT NULL,
    "PreviousValueJson" jsonb,
    "NewValueJson" jsonb,
    "Decision" text,
    "Justification" text,
    "IpDeviceInformation" text,
    CONSTRAINT "PK_audit_logs" PRIMARY KEY ("Id")
);


CREATE TABLE exchange_rates (
    "Id" uuid NOT NULL,
    "OriginalCurrency" text NOT NULL,
    "ConvertedCurrency" text NOT NULL,
    "Rate" numeric(24,12) NOT NULL,
    "RateDate" date NOT NULL,
    "NbeSourceReference" text NOT NULL,
    "RetrievedAt" timestamp with time zone NOT NULL,
    CONSTRAINT "PK_exchange_rates" PRIMARY KEY ("Id")
);


CREATE TABLE hs_revisions (
    "Id" uuid NOT NULL,
    "Name" character varying(100) NOT NULL,
    "Number" integer NOT NULL,
    "EffectiveDate" date NOT NULL,
    "EndDate" date,
    "Status" character varying(30) NOT NULL,
    "SourceReference" text NOT NULL,
    CONSTRAINT "PK_hs_revisions" PRIMARY KEY ("Id")
);


CREATE TABLE local_markets (
    "Id" uuid NOT NULL,
    "NameEn" text NOT NULL,
    "NameAm" text,
    "Region" text NOT NULL,
    CONSTRAINT "PK_local_markets" PRIMARY KEY ("Id")
);


CREATE TABLE price_sources (
    "Id" uuid NOT NULL,
    "Name" text NOT NULL,
    "Pool" text NOT NULL,
    "ApprovalReference" text NOT NULL,
    "IsApproved" boolean NOT NULL,
    CONSTRAINT "PK_price_sources" PRIMARY KEY ("Id")
);


CREATE TABLE hs_codes (
    "Id" uuid NOT NULL,
    "RevisionId" uuid NOT NULL,
    "Code" character varying(6) NOT NULL,
    "DescriptionEn" text NOT NULL,
    "DescriptionAm" text,
    CONSTRAINT "PK_hs_codes" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_hs_codes_hs_revisions_RevisionId" FOREIGN KEY ("RevisionId") REFERENCES hs_revisions ("Id") ON DELETE RESTRICT
);


CREATE TABLE historical_customs_prices (
    "Id" uuid NOT NULL,
    "HsCodeId" uuid NOT NULL,
    "SourceId" uuid NOT NULL,
    "SourceReference" text NOT NULL,
    "ProductDescription" text NOT NULL,
    "BrandModel" text,
    "QualityGrade" text,
    "Quantity" numeric(24,8) NOT NULL,
    "QuantityUnit" text NOT NULL,
    "OriginalValue" numeric(24,8) NOT NULL,
    "OriginalCurrency" character varying(3) NOT NULL,
    "UnitPrice" numeric(24,8),
    "PriceDate" date NOT NULL,
    "ExchangeRateId" uuid,
    "ConvertedValue" numeric(24,8),
    "ConvertedCurrency" character varying(3),
    "RetrievedAt" timestamp with time zone NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "DeclarationReference" text NOT NULL,
    "AuthorizationReference" text NOT NULL,
    "ValuationMethod" text NOT NULL,
    "SourceCountryCode" text NOT NULL,
    "Incoterm" text,
    CONSTRAINT "PK_historical_customs_prices" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_historical_customs_prices_exchange_rates_ExchangeRateId" FOREIGN KEY ("ExchangeRateId") REFERENCES exchange_rates ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_historical_customs_prices_hs_codes_HsCodeId" FOREIGN KEY ("HsCodeId") REFERENCES hs_codes ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_historical_customs_prices_price_sources_SourceId" FOREIGN KEY ("SourceId") REFERENCES price_sources ("Id") ON DELETE RESTRICT
);


CREATE TABLE hs_code_correlations (
    "Id" uuid NOT NULL,
    "MappingGroupId" uuid NOT NULL,
    "FromCodeId" uuid NOT NULL,
    "ToCodeId" uuid,
    "Kind" text NOT NULL,
    "SourceReference" text NOT NULL,
    CONSTRAINT "PK_hs_code_correlations" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_hs_code_correlations_hs_codes_FromCodeId" FOREIGN KEY ("FromCodeId") REFERENCES hs_codes ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_hs_code_correlations_hs_codes_ToCodeId" FOREIGN KEY ("ToCodeId") REFERENCES hs_codes ("Id") ON DELETE RESTRICT
);


CREATE TABLE local_prices (
    "Id" uuid NOT NULL,
    "HsCodeId" uuid NOT NULL,
    "SourceId" uuid NOT NULL,
    "SourceReference" text NOT NULL,
    "ProductDescription" text NOT NULL,
    "BrandModel" text,
    "QualityGrade" text,
    "Quantity" numeric(24,8) NOT NULL,
    "QuantityUnit" text NOT NULL,
    "OriginalValue" numeric(24,8) NOT NULL,
    "OriginalCurrency" character varying(3) NOT NULL,
    "UnitPrice" numeric(24,8),
    "PriceDate" date NOT NULL,
    "ExchangeRateId" uuid,
    "ConvertedValue" numeric(24,8),
    "ConvertedCurrency" character varying(3),
    "RetrievedAt" timestamp with time zone NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "MarketId" uuid NOT NULL,
    "SupplierReference" text NOT NULL,
    "PriceType" text NOT NULL,
    "VatIncluded" boolean,
    "OtherTaxesIncluded" boolean,
    "TransportIncluded" boolean,
    "VerificationDate" date,
    CONSTRAINT "PK_local_prices" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_local_prices_exchange_rates_ExchangeRateId" FOREIGN KEY ("ExchangeRateId") REFERENCES exchange_rates ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_local_prices_hs_codes_HsCodeId" FOREIGN KEY ("HsCodeId") REFERENCES hs_codes ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_local_prices_local_markets_MarketId" FOREIGN KEY ("MarketId") REFERENCES local_markets ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_local_prices_price_sources_SourceId" FOREIGN KEY ("SourceId") REFERENCES price_sources ("Id") ON DELETE RESTRICT
);


CREATE TABLE national_tariff_lines (
    "Id" uuid NOT NULL,
    "HsCodeId" uuid NOT NULL,
    "Code" text NOT NULL,
    "DescriptionEn" text NOT NULL,
    "DescriptionAm" text,
    "SourceReference" text NOT NULL,
    "EffectiveDate" date NOT NULL,
    "EndDate" date,
    CONSTRAINT "PK_national_tariff_lines" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_national_tariff_lines_hs_codes_HsCodeId" FOREIGN KEY ("HsCodeId") REFERENCES hs_codes ("Id") ON DELETE RESTRICT
);


CREATE TABLE reference_prices (
    "Id" uuid NOT NULL,
    "HsCodeId" uuid NOT NULL,
    "SourceId" uuid NOT NULL,
    "SourceReference" text NOT NULL,
    "ProductDescription" text NOT NULL,
    "BrandModel" text,
    "QualityGrade" text,
    "Quantity" numeric(24,8) NOT NULL,
    "QuantityUnit" text NOT NULL,
    "OriginalValue" numeric(24,8) NOT NULL,
    "OriginalCurrency" character varying(3) NOT NULL,
    "UnitPrice" numeric(24,8),
    "PriceDate" date NOT NULL,
    "ExchangeRateId" uuid,
    "ConvertedValue" numeric(24,8),
    "ConvertedCurrency" character varying(3),
    "RetrievedAt" timestamp with time zone NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "ImportCountryCode" text NOT NULL,
    "SourceCountryCode" text NOT NULL,
    "TradeFlow" text NOT NULL,
    "TradePeriod" text NOT NULL,
    "Incoterm" text,
    "Freight" numeric(24,8),
    "Insurance" numeric(24,8),
    CONSTRAINT "PK_reference_prices" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_reference_prices_exchange_rates_ExchangeRateId" FOREIGN KEY ("ExchangeRateId") REFERENCES exchange_rates ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_reference_prices_hs_codes_HsCodeId" FOREIGN KEY ("HsCodeId") REFERENCES hs_codes ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_reference_prices_price_sources_SourceId" FOREIGN KEY ("SourceId") REFERENCES price_sources ("Id") ON DELETE RESTRICT
);


CREATE TABLE valuation_decisions (
    "Id" uuid NOT NULL,
    "HsCodeId" uuid NOT NULL,
    "SelectedReferenceValue" numeric(24,8) NOT NULL,
    "Currency" text NOT NULL,
    "Decision" text NOT NULL,
    "Justification" text NOT NULL,
    "OfficerSubjectId" text NOT NULL,
    "RecordedAt" timestamp with time zone NOT NULL,
    CONSTRAINT "PK_valuation_decisions" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_valuation_decisions_hs_codes_HsCodeId" FOREIGN KEY ("HsCodeId") REFERENCES hs_codes ("Id") ON DELETE RESTRICT
);


CREATE TABLE decision_evidence (
    "Id" uuid NOT NULL,
    "DecisionId" uuid NOT NULL,
    "InternationalPriceId" uuid,
    "LocalPriceId" uuid,
    "HistoricalCustomsPriceId" uuid,
    "EvidenceSnapshotJson" jsonb NOT NULL,
    "ComparisonRuleVersion" text NOT NULL,
    CONSTRAINT "PK_decision_evidence" PRIMARY KEY ("Id"),
    CONSTRAINT ck_one_evidence_pool CHECK (num_nonnulls("InternationalPriceId", "LocalPriceId", "HistoricalCustomsPriceId") = 1),
    CONSTRAINT "FK_decision_evidence_historical_customs_prices_HistoricalCusto~" FOREIGN KEY ("HistoricalCustomsPriceId") REFERENCES historical_customs_prices ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_decision_evidence_local_prices_LocalPriceId" FOREIGN KEY ("LocalPriceId") REFERENCES local_prices ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_decision_evidence_reference_prices_InternationalPriceId" FOREIGN KEY ("InternationalPriceId") REFERENCES reference_prices ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_decision_evidence_valuation_decisions_DecisionId" FOREIGN KEY ("DecisionId") REFERENCES valuation_decisions ("Id") ON DELETE RESTRICT
);


CREATE INDEX "IX_audit_logs_RecordId_OccurredAt" ON audit_logs ("RecordId", "OccurredAt");


CREATE INDEX "IX_decision_evidence_DecisionId" ON decision_evidence ("DecisionId");


CREATE INDEX "IX_decision_evidence_HistoricalCustomsPriceId" ON decision_evidence ("HistoricalCustomsPriceId");


CREATE INDEX "IX_decision_evidence_InternationalPriceId" ON decision_evidence ("InternationalPriceId");


CREATE INDEX "IX_decision_evidence_LocalPriceId" ON decision_evidence ("LocalPriceId");


CREATE INDEX "IX_exchange_rates_OriginalCurrency_ConvertedCurrency_RateDate" ON exchange_rates ("OriginalCurrency", "ConvertedCurrency", "RateDate");


CREATE INDEX "IX_historical_customs_prices_ExchangeRateId" ON historical_customs_prices ("ExchangeRateId");


CREATE INDEX "IX_historical_customs_prices_HsCodeId_PriceDate" ON historical_customs_prices ("HsCodeId", "PriceDate");


CREATE INDEX "IX_historical_customs_prices_SourceId" ON historical_customs_prices ("SourceId");


CREATE INDEX "IX_hs_code_correlations_FromCodeId" ON hs_code_correlations ("FromCodeId");


CREATE INDEX "IX_hs_code_correlations_MappingGroupId" ON hs_code_correlations ("MappingGroupId");


CREATE INDEX "IX_hs_code_correlations_ToCodeId" ON hs_code_correlations ("ToCodeId");


CREATE UNIQUE INDEX "IX_hs_codes_RevisionId_Code" ON hs_codes ("RevisionId", "Code");


CREATE UNIQUE INDEX "IX_hs_revisions_Number" ON hs_revisions ("Number");


CREATE INDEX "IX_local_prices_ExchangeRateId" ON local_prices ("ExchangeRateId");


CREATE INDEX "IX_local_prices_HsCodeId_PriceDate" ON local_prices ("HsCodeId", "PriceDate");


CREATE INDEX "IX_local_prices_MarketId" ON local_prices ("MarketId");


CREATE INDEX "IX_local_prices_SourceId" ON local_prices ("SourceId");


CREATE UNIQUE INDEX "IX_national_tariff_lines_HsCodeId_Code_EffectiveDate" ON national_tariff_lines ("HsCodeId", "Code", "EffectiveDate");


CREATE INDEX "IX_reference_prices_ExchangeRateId" ON reference_prices ("ExchangeRateId");


CREATE INDEX "IX_reference_prices_HsCodeId_PriceDate" ON reference_prices ("HsCodeId", "PriceDate");


CREATE INDEX "IX_reference_prices_SourceId" ON reference_prices ("SourceId");


CREATE INDEX "IX_valuation_decisions_HsCodeId" ON valuation_decisions ("HsCodeId");


