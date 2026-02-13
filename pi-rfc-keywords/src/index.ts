import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const RFC_KEYWORDS: Record<string, string> = {
  "must not": "MUST NOT",
  "shall not": "SHALL NOT",
  "should not": "SHOULD NOT",
  "not recommended": "NOT RECOMMENDED",
  must: "MUST",
  required: "REQUIRED",
  shall: "SHALL",
  should: "SHOULD",
  recommended: "RECOMMENDED",
  may: "MAY",
  optional: "OPTIONAL",
};

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyRfcKeywordReplacements(text: string): string {
  let result = text;
  const keys = Object.keys(RFC_KEYWORDS).sort((a, b) => b.length - a.length);

  for (const key of keys) {
    const replacement = RFC_KEYWORDS[key];
    if (!replacement) continue;
    const pattern = new RegExp(`\\b${escapeRegex(key)}\\b`, "gi");
    result = result.replace(pattern, replacement);
  }

  return result;
}

export default function rfcKeywordsExtension(pi: ExtensionAPI): void {
  pi.on("input", (event) => {
    if (!event.text) return { action: "continue" as const };

    if (event.text.startsWith("/")) {
      const firstSpace = event.text.indexOf(" ");
      if (firstSpace === -1) return { action: "continue" as const };
      const command = event.text.slice(0, firstSpace);
      const args = event.text.slice(firstSpace + 1);
      const transformedArgs = applyRfcKeywordReplacements(args);
      if (transformedArgs === args) return { action: "continue" as const };
      return { action: "transform" as const, text: `${command} ${transformedArgs}` };
    }

    const transformed = applyRfcKeywordReplacements(event.text);
    if (transformed === event.text) return { action: "continue" as const };

    return { action: "transform" as const, text: transformed };
  });
}
