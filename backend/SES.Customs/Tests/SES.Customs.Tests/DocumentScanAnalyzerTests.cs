using SES.Customs.API.Services.DocumentScanning;
using SES.Customs.Core.Models;
using Xunit;

namespace SES.Customs.Tests;

/// <summary>The OCR engine answers one "name: value" line per requested field; these readings mirror the sample customs documents.</summary>
public sealed class DocumentScanAnalyzerTests
{
    private static DeclarationScanContext IPhone(string kind, decimal? amount = 60000m, bool duplicate = false, bool foreign = false) =>
        new(kind, "Smartphone", "Apple", "iPhone 15", "8517.13.00", "CN", "China", 100, "pieces", amount, "USD", ["Addis Digital Trading PLC", "Selam Tesfaye"], duplicate, foreign);

    private const string IPhonePackingList = """
        document type: packing list
        title: PACKING LIST
        goods description: Apple iPhone 15 smartphone, 128 GB, sealed retail units
        hs code: 851713
        country of origin: China
        quantity: 100 pieces
        total amount: none
        seller: Shenzhen Mobile Devices Co., Ltd.
        buyer: Addis Digital Trading PLC
        document number: PL-TEST-001
        """;

    private const string IPhoneInvoice = """
        document type: commercial invoice
        title: COMMERCIAL INVOICE
        goods description: Apple iPhone 15, 128GB
        hs code: 8517.13.00
        country of origin: China
        quantity: 100 pieces
        total amount: $60,000.00
        seller: Tech World Exports Inc.
        buyer: Addis Digital Trading PLC
        document number: INV-2026-001
        """;

    private const string ClothCertificate = """
        document type: certificate of origin
        title: CERTIFICATE OF ORIGIN
        goods description: Woven cotton fabric, dyed, for garment manufacturing
        hs code: 520852
        country of origin: India
        quantity: 3,200 kg
        total amount: none
        seller: Maharashtra Textile Mills Ltd.
        buyer: Addis Garment Supply PLC
        document number: PL-TEST-003
        """;

    private const string Recipe = """
        document type: not a trade document - recipe
        title: Grandma's Doro Wat
        goods description: none
        hs code: none
        country of origin: none
        quantity: none
        total amount: none
        seller: none
        buyer: none
        document number: none
        """;

    [Fact]
    public void MatchingPackingListIsHealthy()
    {
        var verdict = DocumentScanAnalyzer.AnalyzeDeclarationDocument(IPhonePackingList, IPhone("PACKING_LIST"));
        Assert.Equal(DocumentScanFlags.Healthy, verdict.Flag);
        Assert.Equal("Packing list", verdict.DetectedType);
        Assert.True(verdict.Score >= 90);
        Assert.Contains(verdict.Findings, f => f.Check == "HS code" && f.Result == DocumentScanAnalyzer.Pass);
    }

    [Fact]
    public void MatchingInvoiceIsHealthy()
    {
        var verdict = DocumentScanAnalyzer.AnalyzeDeclarationDocument(IPhoneInvoice, IPhone("COMMERCIAL_INVOICE"));
        Assert.Equal(DocumentScanFlags.Healthy, verdict.Flag);
        Assert.Contains(verdict.Findings, f => f.Check == "Invoice amount" && f.Result == DocumentScanAnalyzer.Pass);
    }

    [Fact]
    public void PackingListUploadedAsInvoiceIsSuspicious()
    {
        var verdict = DocumentScanAnalyzer.AnalyzeDeclarationDocument(IPhonePackingList, IPhone("COMMERCIAL_INVOICE"));
        Assert.Equal(DocumentScanFlags.Suspicious, verdict.Flag);
        Assert.Contains(verdict.Findings, f => f.Check == "Document type" && f.Result == DocumentScanAnalyzer.Fail && f.Detail.Contains("packing list"));
    }

    [Fact]
    public void RecipeIsUnrelated()
    {
        var verdict = DocumentScanAnalyzer.AnalyzeDeclarationDocument(Recipe, IPhone("CERTIFICATE_OF_ORIGIN"));
        Assert.Equal(DocumentScanFlags.Unrelated, verdict.Flag);
        Assert.Equal("Recipe", verdict.DetectedType);
    }

    [Fact]
    public void PlainTranscriptionOfUnrelatedPageIsUnrelated()
    {
        var verdict = DocumentScanAnalyzer.AnalyzeDeclarationDocument("Abebe Kebede\nSoftware developer\nExperience: backend developer\nEducation: BSc Computer Science", IPhone("PACKING_LIST"));
        Assert.Equal(DocumentScanFlags.Unrelated, verdict.Flag);
    }

    [Fact]
    public void CertificateForOtherGoodsIsSuspicious()
    {
        var verdict = DocumentScanAnalyzer.AnalyzeDeclarationDocument(ClothCertificate, IPhone("CERTIFICATE_OF_ORIGIN"));
        Assert.Equal(DocumentScanFlags.Suspicious, verdict.Flag);
        Assert.Contains(verdict.Findings, f => f.Check == "Goods" && f.Result == DocumentScanAnalyzer.Fail);
        Assert.Contains(verdict.Findings, f => f.Check == "HS code" && f.Result == DocumentScanAnalyzer.Fail);
        Assert.Contains(verdict.Findings, f => f.Check == "Country of origin" && f.Result == DocumentScanAnalyzer.Fail);
    }

    [Fact]
    public void InvoiceAmountFarFromDeclarationIsSuspicious()
    {
        var verdict = DocumentScanAnalyzer.AnalyzeDeclarationDocument(IPhoneInvoice, IPhone("COMMERCIAL_INVOICE", amount: 20000m));
        Assert.Equal(DocumentScanFlags.Suspicious, verdict.Flag);
        Assert.Contains(verdict.Findings, f => f.Check == "Invoice amount" && f.Result == DocumentScanAnalyzer.Fail);
    }

    [Fact]
    public void InvoiceForDifferentModelIsSuspicious()
    {
        var verdict = DocumentScanAnalyzer.AnalyzeDeclarationDocument(IPhoneInvoice.Replace("Apple iPhone 15, 128GB", "Apple iPhone 17 Pro Max, 256GB, Natural Titanium"), IPhone("COMMERCIAL_INVOICE"));
        Assert.Equal(DocumentScanFlags.Suspicious, verdict.Flag);
        Assert.Contains(verdict.Findings, f => f.Check == "Goods" && f.Result == DocumentScanAnalyzer.Fail && f.Detail.Contains("iPhone 15"));
    }

    [Fact]
    public void BlankPageIsSuspicious()
    {
        var verdict = DocumentScanAnalyzer.AnalyzeDeclarationDocument("  ", IPhone("PACKING_LIST"));
        Assert.Equal(DocumentScanFlags.Suspicious, verdict.Flag);
        Assert.Equal("Unreadable", verdict.DetectedType);
    }

    [Fact]
    public void ReusedFileIsSuspicious()
    {
        var verdict = DocumentScanAnalyzer.AnalyzeDeclarationDocument(IPhonePackingList, IPhone("PACKING_LIST", duplicate: true));
        Assert.Equal(DocumentScanFlags.Suspicious, verdict.Flag);
        Assert.Contains(verdict.Findings, f => f.Check == "Same file reused");
    }

    [Fact]
    public void ParsesMarkdownStyleFieldLines()
    {
        var fields = DocumentScanAnalyzer.ParseFields("- **Document type**: Packing List\n* hs_code: 8517.13\nnoise line");
        Assert.Equal("Packing List", fields["document type"]);
        Assert.Equal("8517.13", fields["hs code"]);
    }

    private static VerificationScanContext Business(string kind) =>
        new(kind, ["Addis Digital Trading PLC", "Addis Digital", "Selam Tesfaye"], "0012345678", ["TL/AA/14/123456", "MT/AA/1/0001234"]);

    [Fact]
    public void MatchingTinCertificateIsHealthy()
    {
        var verdict = DocumentScanAnalyzer.AnalyzeVerificationDocument("document type: TIN certificate\ntitle: Taxpayer Registration Certificate\nholder name: Addis Digital Trading PLC\ntin: 0012345678\nregistration number: none\nexpiry date: none", Business("TIN_CERTIFICATE"));
        Assert.Equal(DocumentScanFlags.Healthy, verdict.Flag);
    }

    [Fact]
    public void TinMismatchIsSuspicious()
    {
        var verdict = DocumentScanAnalyzer.AnalyzeVerificationDocument("document type: TIN certificate\nholder name: Addis Digital Trading PLC\ntin: 0099999999", Business("TIN_CERTIFICATE"));
        Assert.Equal(DocumentScanFlags.Suspicious, verdict.Flag);
        Assert.Contains(verdict.Findings, f => f.Check == "TIN" && f.Result == DocumentScanAnalyzer.Fail);
    }

    [Fact]
    public void ExpiredLicenceIsSuspicious()
    {
        var verdict = DocumentScanAnalyzer.AnalyzeVerificationDocument("document type: trade licence\nholder name: Addis Digital Trading PLC\nregistration number: TL/AA/14/123456\nexpiry date: 2024-07-07", Business("TRADE_LICENSE"));
        Assert.Equal(DocumentScanFlags.Suspicious, verdict.Flag);
        Assert.Contains(verdict.Findings, f => f.Check == "Validity" && f.Result == DocumentScanAnalyzer.Fail);
    }

    [Fact]
    public void PhotoUploadedAsIdIsUnrelated()
    {
        var verdict = DocumentScanAnalyzer.AnalyzeVerificationDocument("document type: not an official document - landscape photo\ntitle: none\nholder name: none\ntin: none\nregistration number: none\nexpiry date: none", Business("IDENTITY_DOCUMENT"));
        Assert.Equal(DocumentScanFlags.Unrelated, verdict.Flag);
    }
}
