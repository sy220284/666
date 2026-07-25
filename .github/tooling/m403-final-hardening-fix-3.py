from pathlib import Path
import sys

script = Path(sys.argv[1])
text = script.read_text()
old_cancelled = r'''    const cancelledIterator = cancelledAdapter
      .generate(request, cancelledController.signal)
      [Symbol.asyncIterator]();
'''
new_cancelled = r'''    const cancelledStream = cancelledAdapter.generate(request, cancelledController.signal);
    const cancelledIterator = cancelledStream[Symbol.asyncIterator]();
'''
old_timeout = r'''    const timeoutIterator = timeoutAdapter
      .generate(request, new AbortController().signal)
      [Symbol.asyncIterator]();
'''
new_timeout = r'''    const timeoutStream = timeoutAdapter.generate(request, new AbortController().signal);
    const timeoutIterator = timeoutStream[Symbol.asyncIterator]();
'''
for label, old, new in [
    ('cancelled stream iterator', old_cancelled, new_cancelled),
    ('timeout stream iterator', old_timeout, new_timeout),
]:
    if text.count(old) != 1:
        raise SystemExit(f'{label} patch target count: {text.count(old)}')
    text = text.replace(old, new, 1)
script.write_text(text)
