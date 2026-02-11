import { keyHint, type Theme } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";

export function renderReadResult(result: any, options: { expanded?: boolean }, theme: Theme) {
  const container = new Container();
  const filesDetails = result.details?.files || [];

  if (!options.expanded) {
    for (let i = 0; i < filesDetails.length; i++) {
      const detail = filesDetails[i];
      if (detail.error) {
        container.addChild(new Text(theme.fg("error", `read ${detail.path}\nERROR: ${detail.error}`), 0, 0));
        continue;
      }

      const startLine = detail.offset ?? 1;
      const range = detail.offset !== undefined || detail.limit !== undefined
        ? `:${startLine}${detail.limit !== undefined ? `-${startLine + detail.limit - 1}` : ""}`
        : "";
      const imageSuffix = detail.mimeType ? theme.fg("muted", ` [${detail.mimeType}]`) : "";
      const line = `${theme.fg("toolTitle", theme.bold("read"))} ${theme.fg("accent", detail.path)}${theme.fg("warning", range)}${imageSuffix}`;
      container.addChild(new Text(line, 0, 0));
    }

    if (filesDetails.length > 0) {
      container.addChild(new Text(theme.fg("muted", `(${keyHint("expandTools", "to expand output")})`), 0, 0));
    }
    return container;
  }

  let contentIndex = 0;

  for (let i = 0; i < filesDetails.length; i++) {
    const detail = filesDetails[i];
    if (detail.error) {
      container.addChild(new Text(theme.fg("error", `--- ${detail.path} ---\nERROR: ${detail.error}`), 0, 0));
      continue;
    }

    let fileContent = "";
    while (contentIndex < result.content.length) {
      const item = result.content[contentIndex++];
      if (item.type === "text") {
        if (item.text?.startsWith("--- ") && item.text?.endsWith(" ---")) continue;
        if (item.text?.startsWith("Read image file [")) continue;
        fileContent = item.text || "";
        break;
      }
    }

    const lines = fileContent.split("\n");
    const maxLines = options.expanded ? lines.length : 10;
    const displayLines = lines.slice(0, maxLines);
    const remaining = lines.length - maxLines;

    let text = theme.fg("accent", `--- ${detail.path} ---\n`);
    text += displayLines.map((line: string) => theme.fg("toolOutput", line)).join("\n");

    if (remaining > 0) {
      text += `\n${theme.fg("muted", `... (${remaining} more lines,`)} ${keyHint("expandTools", "to expand")})`;
    }
    container.addChild(new Text(text, 0, 0));
  }

  return container;
}
