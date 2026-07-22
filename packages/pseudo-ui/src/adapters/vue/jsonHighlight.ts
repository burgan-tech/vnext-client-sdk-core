// Pretty + syntax-highlight a value as JSON for the `{ }` raw viewers (instance
// data, transition history — whole list and per-row). One copy, used everywhere.
// Returns HTML with `d-json-*` spans (styled in the curated sheet); callers bind
// it via `v-html` inside a `<pre>`.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function highlightJson(value: unknown): string {
  const json = escapeHtml(JSON.stringify(value, null, 2) ?? 'null')
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(\.\d*)?([eE][+-]?\d+)?)/g,
    (m) => {
      let cls = 'd-json-num'
      if (/^"/.test(m)) cls = /:$/.test(m) ? 'd-json-key' : 'd-json-str'
      else if (/true|false/.test(m)) cls = 'd-json-bool'
      else if (/null/.test(m)) cls = 'd-json-null'
      return `<span class="${cls}">${m}</span>`
    },
  )
}
