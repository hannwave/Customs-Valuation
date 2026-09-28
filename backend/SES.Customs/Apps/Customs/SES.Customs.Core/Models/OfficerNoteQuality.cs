using System.Text.RegularExpressions;

namespace SES.Customs.Core.Models;

/// <summary>
/// Lightweight quality checks for optional officer-authored notes. This is a
/// readability filter, not a semantic/legal review of an officer's statement.
/// </summary>
public static class OfficerNoteQuality
{
    private static readonly Regex Words = new(@"[\p{L}\p{M}]+", RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex RepeatedCharacter = new(@"(.)\1{4,}", RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    private static readonly Regex KeyboardMash = new(@"(?:qwerty|asdfg|zxcvb|qazwsx|wsxedc|poiuyt|lkjhg|mnbvc)", RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    private static readonly HashSet<string> Placeholders = new(StringComparer.OrdinalIgnoreCase)
    {
        "asdf", "qwerty", "zxcv", "lorem", "ipsum", "placeholder", "dummy", "blah", "test", "testing", "xxx", "random"
    };

    public static string? Check(string? value, int maxLength = 500)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var text = value.Trim();
        if (text.Length > maxLength) return "Keep the optional note to " + maxLength + " characters or fewer.";

        var words = Words.Matches(text).Select(match => match.Value).ToArray();
        var letterCount = words.Sum(word => word.Length);
        if (letterCount < 4 || (words.Length < 2 && (words.FirstOrDefault()?.Length ?? 0) < 5))
            return "Please use a short, readable explanation with meaningful words; random characters or fragments are not accepted.";

        if (words.Any(word => Placeholders.Contains(word)) || RepeatedCharacter.IsMatch(text) || KeyboardMash.IsMatch(text))
            return "This looks like placeholder or random text. Please enter a readable note, or leave the optional field blank.";

        if (words.Length >= 3 && words.GroupBy(word => word, StringComparer.OrdinalIgnoreCase).Any(group => group.Count() >= 3))
            return "Avoid repeated words; enter a readable note, or leave the optional field blank.";

        foreach (var word in words.Where(word => word.Length >= 6 && word.All(character => character <= 127)))
        {
            if (!word.Any(character => "aeiouyAEIOUY".Contains(character)))
                return "This looks like random text. Please enter a readable note, or leave the optional field blank.";
        }

        return null;
    }
}
