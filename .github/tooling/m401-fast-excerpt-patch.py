from pathlib import Path
import sys

script = Path(sys.argv[1])
text = script.read_text()

start = text.index('excerpt = """function excerpt(')
end_marker = "text = replace_between(text, 'function excerpt(', 'function deleteTarget(', excerpt)"
end = text.index(end_marker, start)
replacement = '''excerpt = """function excerpt(content: string, query: string): string {
  const loweredQuery = query.toLocaleLowerCase('zh-CN');
  const directIndex = content.toLocaleLowerCase('zh-CN').indexOf(loweredQuery);
  if (directIndex >= 0) {
    const start = Math.max(0, directIndex - 80);
    const end = Math.min(content.length, directIndex + query.length + 120);
    const value = content.slice(start, end).trim();
    return `${start > 0 ? '…' : ''}${value}${end < content.length ? '…' : ''}`.slice(0, 2_000);
  }
  const view = normalizedSearchView(content);
  const normalizedQuery = normalizeSearchTerm(query);
  const index = view.value.indexOf(normalizedQuery);
  const matchStart = index < 0 ? 0 : (view.starts[index] ?? 0);
  const matchEndIndex = Math.min(
    view.ends.length - 1,
    Math.max(index, index + normalizedQuery.length - 1),
  );
  const matchEnd = index < 0 ? 0 : (view.ends[matchEndIndex] ?? matchStart);
  const start = Math.max(0, matchStart - 80);
  const end = Math.min(content.length, index < 0 ? 120 : matchEnd + 120);
  const value = content.slice(start, end).trim();
  return `${start > 0 ? '…' : ''}${value}${end < content.length ? '…' : ''}`.slice(0, 2_000);
}

"""
'''
text = text[:start] + replacement + text[end:]

old = '''    const normalizedQuery = normalizeSearchTerm(query);
    const bodyMatches = normalizedSearchView(body).value.includes(normalizedQuery);
    const titleMatches = normalizedSearchView(title).value.includes(normalizedQuery);'''
new = '''    const normalizedQuery = normalizeSearchTerm(query);
    const loweredQuery = query.toLocaleLowerCase('zh-CN');
    const bodyMatches =
      body.toLocaleLowerCase('zh-CN').includes(loweredQuery) ||
      normalizedSearchView(body).value.includes(normalizedQuery);
    const titleMatches =
      title.toLocaleLowerCase('zh-CN').includes(loweredQuery) ||
      normalizedSearchView(title).value.includes(normalizedQuery);'''
if text.count(old) != 2:
    raise SystemExit('authoritative fast match targets not found')
text = text.replace(old, new)
script.write_text(text)
