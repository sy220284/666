-- migration-policy: allow-unscoped-write
-- Normalize legacy arbitrary provider options to the protocol allowlist before strict contracts read them.
UPDATE provider_configs
SET options_json = CASE
  WHEN protocol = 'anthropic'
    AND json_valid(options_json) = 1
  THEN CASE
    WHEN json_type(options_json, '$.anthropicVersion') = 'text'
      AND length(trim(json_extract(options_json, '$.anthropicVersion'))) BETWEEN 1 AND 64
    THEN json_object(
      'anthropicVersion',
      trim(json_extract(options_json, '$.anthropicVersion'))
    )
    ELSE '{}'
  END
  ELSE '{}'
END;
