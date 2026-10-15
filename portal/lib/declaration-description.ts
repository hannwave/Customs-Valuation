/**
 * Splits the description the declaration form writes ("Name. Category: … . Condition: … . Invoice terms: … . Specs: … . Details: …")
 * back into labelled facts, so pages show fields instead of the raw sentence. Free-text descriptions come back as `details`.
 */
export function splitDescription(description: string | null | undefined) {
  const text = (description ?? "").trim();
  if (!/Category: /.test(text)) return { facts: [] as [string, string][], details: text };
  const pick = (pattern: RegExp) => pattern.exec(text)?.[1]?.trim() ?? "";
  const facts: [string, string][] = [];
  const category = pick(/Category: ([^.]+)\./), condition = pick(/Condition: ([^.]+)\./), terms = pick(/Invoice terms: ([A-Z]+)/);
  if (category) facts.push(["Product group", category]);
  if (condition) facts.push(["Condition", condition]);
  if (terms) facts.push(["Invoice terms", terms]);
  for (const part of pick(/Specs: ([\s\S]*?)\.(?= Details:|$)/).split("; ")) {
    const at = part.indexOf(": ");
    if (at > 0 && part.slice(at + 2).trim()) facts.push([part.slice(0, at), part.slice(at + 2).trim()]);
  }
  return { facts, details: pick(/Details: ([\s\S]*)$/) };
}
