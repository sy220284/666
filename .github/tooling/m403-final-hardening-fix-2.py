from pathlib import Path
import sys

script = Path(sys.argv[1])
text = script.read_text()
old_cancelled = r'''    const cancelledController = new AbortController();
    const cancelledIterator = createProviderAdapter(config('https://provider.example/v1'), null, {
      fetch: stalledFetch as typeof fetch,
    })
      .generate(request, cancelledController.signal)
      [Symbol.asyncIterator]();
'''
new_cancelled = r'''    const cancelledController = new AbortController();
    const cancelledAdapter = createProviderAdapter(config('https://provider.example/v1'), null, {
      fetch: stalledFetch as typeof fetch,
    });
    const cancelledIterator = cancelledAdapter
      .generate(request, cancelledController.signal)
      [Symbol.asyncIterator]();
'''
old_timeout = r'''    const timeoutIterator = createProviderAdapter(
      { ...config('https://provider.example/v1'), timeoutMs: 1_000 },
      null,
      { fetch: stalledFetch as typeof fetch },
    )
      .generate(request, new AbortController().signal)
      [Symbol.asyncIterator]();
'''
new_timeout = r'''    const timeoutAdapter = createProviderAdapter(
      { ...config('https://provider.example/v1'), timeoutMs: 1_000 },
      null,
      { fetch: stalledFetch as typeof fetch },
    );
    const timeoutIterator = timeoutAdapter
      .generate(request, new AbortController().signal)
      [Symbol.asyncIterator]();
'''
for label, old, new in [
    ('cancelled adapter test', old_cancelled, new_cancelled),
    ('timeout adapter test', old_timeout, new_timeout),
]:
    if text.count(old) != 1:
        raise SystemExit(f'{label} patch target count: {text.count(old)}')
    text = text.replace(old, new, 1)
script.write_text(text)
