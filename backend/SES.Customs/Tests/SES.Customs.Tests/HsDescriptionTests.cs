using SES.Customs.API.Integrations.Hs;
using SES.Customs.API.Services;
using Xunit;

namespace SES.Customs.Tests;

public sealed class HsDescriptionTests
{
    [Theory]
    [InlineData("-- Other", "Telephone sets; smartphones", "Telephone sets; smartphones — other")]
    [InlineData("--- Presented CKD or SKD for the assembly:", "Telephone sets", "Presented CKD or SKD for the assembly")]
    [InlineData("", "Coffee, not roasted", "Coffee, not roasted")]
    [InlineData("Other", "", "")]
    [InlineData("-- Other", "-- Other", "")]
    public void TariffBookTextReadsOnItsOwn(string line, string hs, string expected) => Assert.Equal(expected, TariffDescriptions.Readable(line, hs));

    [Theory]
    [InlineData("8517")]
    [InlineData("85.17")]
    [InlineData("851713")]
    [InlineData("8517.1390")]
    [InlineData("85171390000")]
    public void EveryCodeLengthHasANomenclatureDescription(string code) => Assert.False(string.IsNullOrWhiteSpace(HsNomenclature.Describe(code)));

    [Fact]
    public void HeadingsUseTheWcoHeadingText() => Assert.StartsWith("Telephone sets", HsNomenclature.Heading("85.17"));
}
