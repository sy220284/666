from pathlib import Path

path = Path('apps/desktop/main/src/ipc-handlers.ts')
text = path.read_text()
replacements = [
    (
        """    if (!existingResult.ok) return providerFailure(requestId, existingResult.errorCode);
    const existing = existingResult.data.provider;
""",
        """    if (!existingResult.ok) return providerFailure(requestId, existingResult.errorCode);
    if (existingResult.operation !== PROVIDER_CORE_OPERATIONS.get) {
      return providerFailure(requestId, 'COMMON_INTERNAL_999');
    }
    const existing = existingResult.data.provider;
""",
        1,
        'save existing result',
    ),
    (
        """    if (!saved.ok) {
""",
        """    if (!saved.ok) {
""",
        1,
        'saved failure anchor',
    ),
    (
        """      return providerFailure(requestId, saved.errorCode);
    }

    if (existing?.credentialRef && existing.credentialRef !== credentialRef) {
""",
        """      return providerFailure(requestId, saved.errorCode);
    }
    if (saved.operation !== PROVIDER_CORE_OPERATIONS.upsert) {
      return providerFailure(requestId, 'COMMON_INTERNAL_999');
    }

    if (existing?.credentialRef && existing.credentialRef !== credentialRef) {
""",
        1,
        'saved result narrowing',
    ),
    (
        """    if (!existingResult.ok) return providerFailure(requestId, existingResult.errorCode);
    const removed = await options.supervisor.invokeProviderOperation(requestId, {
""",
        """    if (!existingResult.ok) return providerFailure(requestId, existingResult.errorCode);
    if (existingResult.operation !== PROVIDER_CORE_OPERATIONS.get) {
      return providerFailure(requestId, 'COMMON_INTERNAL_999');
    }
    const removed = await options.supervisor.invokeProviderOperation(requestId, {
""",
        1,
        'remove existing result',
    ),
    (
        """    if (!removed.ok) return providerFailure(requestId, removed.errorCode);
    if (removed.data.removed && existingResult.data.provider?.credentialRef) {
""",
        """    if (!removed.ok) return providerFailure(requestId, removed.errorCode);
    if (removed.operation !== PROVIDER_CORE_OPERATIONS.remove) {
      return providerFailure(requestId, 'COMMON_INTERNAL_999');
    }
    if (removed.data.removed && existingResult.data.provider?.credentialRef) {
""",
        1,
        'remove result narrowing',
    ),
    (
        """    if (!existingResult.ok) return providerFailure(requestId, existingResult.errorCode);
    const config = existingResult.data.provider;
""",
        """    if (!existingResult.ok) return providerFailure(requestId, existingResult.errorCode);
    if (existingResult.operation !== PROVIDER_CORE_OPERATIONS.get) {
      return providerFailure(requestId, 'COMMON_INTERNAL_999');
    }
    const config = existingResult.data.provider;
""",
        1,
        'test existing result',
    ),
    (
        """    credential = null;
    return result.ok
      ? success(requestId, result.data)
      : providerFailure(requestId, result.errorCode);
""",
        """    credential = null;
    if (!result.ok) return providerFailure(requestId, result.errorCode);
    if (result.operation !== PROVIDER_CORE_OPERATIONS.testConnection) {
      return providerFailure(requestId, 'COMMON_INTERNAL_999');
    }
    return success(requestId, result.data);
""",
        1,
        'test result narrowing',
    ),
]
for old, new, expected, label in replacements:
    count = text.count(old)
    if count != expected:
        raise SystemExit(f'{label}: target count {count}')
    text = text.replace(old, new, expected)
path.write_text(text)
