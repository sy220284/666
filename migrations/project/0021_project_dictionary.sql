-- M4-01: author-managed project dictionary for canonical terms and short queries.

CREATE TABLE project_dictionary (
  term TEXT PRIMARY KEY CHECK (length(trim(term)) BETWEEN 1 AND 240),
  normalized_term TEXT NOT NULL UNIQUE CHECK (length(normalized_term) BETWEEN 1 AND 240),
  category TEXT NOT NULL CHECK (
    category IN (
      'character', 'location', 'faction', 'item', 'ability',
      'rule', 'event', 'terminology', 'custom'
    )
  ),
  action TEXT NOT NULL CHECK (action IN ('canonical', 'alias', 'ignore', 'replace')),
  replacement_term TEXT,
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 20000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (action IN ('alias', 'replace') AND replacement_term IS NOT NULL AND length(trim(replacement_term)) > 0) OR
    (action IN ('canonical', 'ignore') AND replacement_term IS NULL)
  )
) STRICT;

CREATE INDEX idx_project_dictionary_category_action
ON project_dictionary(category, action, normalized_term);

UPDATE projects SET schema_version = 21;
