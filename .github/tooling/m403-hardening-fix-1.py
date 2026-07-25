from pathlib import Path
import sys

script = Path(sys.argv[1])
text = script.read_text()

old_range = "    (a === 192 && b === 0) ||\n"
new_range = "    (a === 192 && b === 0 && c === 0) ||\n"
if text.count(old_range) != 1:
    raise SystemExit(f'IPv4 reserved range target count: {text.count(old_range)}')
text = text.replace(old_range, new_range, 1)

old_reader = r'''  const reader = lease.response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
'''
new_reader = r'''  const reader = lease.response.body.getReader();
  const onAbort = (): void => {
    void reader.cancel().catch(() => undefined);
  };
  lease.signal.addEventListener('abort', onAbort, { once: true });
  const decoder = new TextDecoder();
  let buffer = '';
  try {
'''
if text.count(old_reader) != 1:
    raise SystemExit(f'SSE reader setup target count: {text.count(old_reader)}')
text = text.replace(old_reader, new_reader, 1)

old_finally = r'''  } finally {
    reader.releaseLock();
    lease.release();
  }
}

'''
new_finally = r'''  } finally {
    lease.signal.removeEventListener('abort', onAbort);
    reader.releaseLock();
    lease.release();
  }
}

'''
if text.count(old_finally) != 1:
    raise SystemExit(f'SSE reader cleanup target count: {text.count(old_finally)}')
text = text.replace(old_finally, new_finally, 1)

old_fixture = '''old_chunk = """      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '好' }, finish_reason: null }] })}\\n\\n`);
"""
new_chunk = """      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '好' }, finish_reason: 'stop' }] })}\\n\\n`);
"""
if integration.count(old_chunk) != 1:
    raise SystemExit(f'openai fixture finish target count: {integration.count(old_chunk)}')
integration = integration.replace(old_chunk, new_chunk, 1)
'''
new_fixture = '''finish_marker = 'finish_reason: null'
if integration.count(finish_marker) != 1:
    raise SystemExit(f'openai fixture finish target count: {integration.count(finish_marker)}')
integration = integration.replace(finish_marker, "finish_reason: 'stop'", 1)
'''
if text.count(old_fixture) != 1:
    raise SystemExit(f'OpenAI fixture patch block target count: {text.count(old_fixture)}')
text = text.replace(old_fixture, new_fixture, 1)

old_classification = """    expect(validateProviderEndpoint('http://[::ffff:192.168.1.20]:8080/v1')).toMatchObject({
      scope: 'lan',
    });
"""
new_classification = """    expect(validateProviderEndpoint('http://[::ffff:192.168.1.20]:8080/v1')).toMatchObject({
      scope: 'lan',
    });
    expect(validateProviderEndpoint('http://[::ffff:127.0.0.1]:8080/v1')).toMatchObject({
      scope: 'loopback',
    });
"""
if text.count(old_classification) != 1:
    raise SystemExit(f'mapped IPv6 classification target count: {text.count(old_classification)}')
text = text.replace(old_classification, new_classification, 1)

blocked_line = "      'http://[::ffff:127.0.0.1]:8080/v1',\n"
if text.count(blocked_line) != 1:
    raise SystemExit(f'mapped loopback blocked-list target count: {text.count(blocked_line)}')
text = text.replace(blocked_line, '', 1)

old_dns = """    await expect(
      inspectProviderEndpoint(
        'https://api.example.com/v1',
        (async () => [{ address: '::ffff:127.0.0.1', family: 6 }]) as never,
      ),
    ).rejects.toMatchObject({ code: 'AI_ENDPOINT_UNSAFE_013' });
"""
new_dns = """    await expect(
      inspectProviderEndpoint(
        'https://api.example.com/v1',
        (async () => [{ address: '169.254.169.254', family: 4 }]) as never,
      ),
    ).rejects.toMatchObject({ code: 'AI_ENDPOINT_UNSAFE_013' });
"""
if text.count(old_dns) != 1:
    raise SystemExit(f'unsafe DNS fixture target count: {text.count(old_dns)}')
text = text.replace(old_dns, new_dns, 1)

script.write_text(text)
