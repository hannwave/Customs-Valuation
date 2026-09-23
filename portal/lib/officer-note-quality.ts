const wordPattern = /[\p{L}\p{M}]+/gu;
const repeatedCharacterPattern = /(.)\1{4,}/iu;
const keyboardMashPattern = /(?:qwerty|asdfg|zxcvb|qazwsx|wsxedc|poiuyt|lkjhg|mnbvc)/iu;
const placeholders = new Set([
  "asdf", "qwerty", "zxcv", "lorem", "ipsum", "placeholder", "dummy", "blah", "test", "testing", "xxx", "random",
]);

/** A small readability check for optional notes; it does not judge meaning or legal sufficiency. */
export function officerNoteIssue(value: string, maxLength = 500): string | null {
  if (!value.trim()) return null;
  const text = value.trim();
  if (text.length > maxLength) return "Keep the optional note to " + maxLength + " characters or fewer.";

  const words = text.match(wordPattern) ?? [];
  const letterCount = words.reduce((count, word) => count + word.length, 0);
  if (letterCount < 4 || (words.length < 2 && (words[0]?.length ?? 0) < 5)) {
    return "Please use a short, readable explanation with meaningful words; random characters or fragments are not accepted.";
  }

  if (words.some(word => placeholders.has(word.toLowerCase())) || repeatedCharacterPattern.test(text) || keyboardMashPattern.test(text)) {
    return "This looks like placeholder or random text. Please enter a readable note, or leave the optional field blank.";
  }

  if (words.length >= 3 && words.some(word => words.filter(candidate => candidate.toLowerCase() === word.toLowerCase()).length >= 3)) {
    return "Avoid repeated words; enter a readable note, or leave the optional field blank.";
  }

  if (words.some(word => word.length >= 6 && /^[a-z]+$/iu.test(word) && !/[aeiouy]/iu.test(word))) {
    return "This looks like random text. Please enter a readable note, or leave the optional field blank.";
  }

  return null;
}
