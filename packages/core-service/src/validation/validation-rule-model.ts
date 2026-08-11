export interface RuleIssue {
  readonly issueType: string;
  readonly severity: 'high' | 'medium' | 'low' | 'info';
  readonly rationale: string;
  readonly suggestion: string;
  readonly logicalBlockId: string | null;
  readonly expectedBlockHash: string | null;
  readonly textQuote: string | null;
  readonly rangeHint: { readonly start: number; readonly end: number } | null;
  readonly evidenceIds: readonly string[];
  readonly currentEvidenceIds?: readonly string[];
  readonly conflictEvidenceIds?: readonly string[];
  readonly entityIds?: readonly string[];
  readonly ruleId: string;
}
