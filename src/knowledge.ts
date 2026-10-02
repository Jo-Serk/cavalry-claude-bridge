import notes from "../knowledge/api-notes.md";

// knowledge/api-notes.md is split into topics by its "## " headings, so contributors only edit the markdown.
const topics = new Map<string, string>();
for (const part of notes.split(/^## /m).slice(1)) {
  const nl = part.indexOf("\n");
  topics.set(part.slice(0, nl).trim().toLowerCase(), part.slice(nl + 1).trim());
}

export function helpText(topic?: string): { text: string; isError: boolean } {
  const names = [...topics.keys()].join(", ");
  if (!topic) return { text: `Topics: ${names}. Call cavalry_help with one of them.`, isError: false };
  const body = topics.get(topic.trim().toLowerCase());
  if (!body) return { text: `Unknown topic '${topic}'. Topics: ${names}.`, isError: true };
  return { text: body, isError: false };
}
