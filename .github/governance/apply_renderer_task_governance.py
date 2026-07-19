from pathlib import Path

ROOT = Path.cwd()


def load(path):
    return (ROOT / path).read_text(encoding='utf-8')


def save(path, content):
    (ROOT / path).write_text(content, encoding='utf-8')


def replace_once(path, old, new):
    content = load(path)
    if old not in content:
        raise RuntimeError(f'missing text in {path}: {old!r}')
    save(path, content.replace(old, new, 1))


matrix = 'docs/product/V1.0_TRACEABILITY_MATRIX.md'
replace_once(matrix, '| REQ-038 | 新手/专业模式与三条创作路径        | UI-001                   | V1_SCOPE、FUNCTION_CATALOG                 | M7-01                      | P0-057—P0-059          | Planned     |', '| REQ-038 | 新手/专业模式与三条创作路径        | UI-001                   | V1_SCOPE、FUNCTION_CATALOG                 | M3-07、M3-08、M7-01        | P0-057—P0-059          | Planned     |')
replace_once(matrix, '| REQ-039 | 写作工作台与沉浸视图               | UI-002/003               | FUNCTION_CATALOG                           | M7-02                      | P0-060                 | Planned     |', '| REQ-039 | 写作工作台与沉浸视图               | UI-002/003               | FUNCTION_CATALOG                           | M3-08、M3-09、M3-10、M7-02 | P0-060                 | Planned     |')
replace_once(matrix, '| REQ-040 | 状态仲裁与帮助                     | UI-004/005               | FUNCTION_CATALOG                           | M7-02                      | P0-061、P0-062         | Planned     |', '| REQ-040 | 状态仲裁与帮助                     | UI-004/005               | FUNCTION_CATALOG                           | M3-07、M3-08、M3-09、M7-02 | P0-061、P0-062         | Planned     |')
replace_once(matrix, '| REQ-041 | 1280×800、2K和21:9适配             | UI-006/007               | RESPONSIVE_AND_DPI、TEST_STRATEGY          | M0-06、M7-03、M8-02        | P0-063—P0-066          | Verified    |', '| REQ-041 | 1280×800、2K和21:9适配             | UI-006/007               | RESPONSIVE_AND_DPI、TEST_STRATEGY          | M0-06、M3-08—M3-10、M7-03、M8-02 | P0-063—P0-066     | Verified    |')
replace_once(matrix, '| REQ-047 | 双视觉主题可切换                   | THM-001                  | UI_SYSTEM、UI_SYSTEM_THEME_B、ADR-007      | M7-03                      | P0-075                 | Planned     |', '| REQ-047 | 双视觉主题可切换                   | THM-001                  | UI_SYSTEM、UI_SYSTEM_THEME_B、ADR-007      | M3-07、M7-03               | P0-075                 | Planned     |')

path = 'scripts/task-control-lib.mjs'
content = load(path)
planning_paths = """export const TASK_PLANNING_ALLOWED_PATHS = [
  'AGENTS.md',
  'README.md',
  'agent.md',
  'docs/INDEX.md',
  'docs/product/V1_TASK_SYSTEM_REBASE.md',
  'docs/product/V1.0_TRACEABILITY_MATRIX.md',
  'docs/product/WORLDFORGE_V6.5_FULL_SPEC.md',
  'docs/roadmap/V1.0_ROADMAP.md',
  'docs/tasks/TASK_INDEX.md',
  'docs/tasks/TASK_TEMPLATE.md',
  'docs/tasks/M3_TASKS.md',
  'docs/tasks/M3/M3-07_RENDERER_REACT_FOUNDATION.md',
  'docs/tasks/M3/M3-08_RENDERER_SHELL_HOME_SETTINGS.md',
  'docs/tasks/M3/M3-09_RENDERER_PLANNING_CANON_STRUCTURE.md',
  'docs/tasks/M3/M3-10_RENDERER_WRITING_CANDIDATE_CUTOVER.md',
  'docs/tasks/M3/RENDERER_ARCHITECTURE_MIGRATION.md',
];

"""
anchor = 'export const GOVERNANCE_ALLOWED_PATHS = [\n'
if planning_paths.strip() not in content:
    if anchor not in content:
        raise RuntimeError('governance path anchor missing')
    content = content.replace(anchor, planning_paths + anchor, 1)
old = """export function isGovernanceOnlyPullRequest(branch, changedFiles) {
  const governanceBranch = /^(?:policy\/|chore\/governance-|fix\/governance-)/u.test(branch ?? '');
  return (
    governanceBranch &&
    changedFiles.length > 0 &&
    changedFiles.every((file) =>
      GOVERNANCE_ALLOWED_PATHS.some((allowed) => isPathInside(file, allowed)),
    )
  );
}
"""
new = """export function isGovernanceOnlyPullRequest(branch, changedFiles) {
  const value = branch ?? '';
  const governanceBranch = /^(?:policy\/|chore\/governance-|fix\/governance-)/u.test(value);
  const planningBranch = /^policy\/task-plan-/u.test(value);
  const allowedPaths = planningBranch
    ? [...GOVERNANCE_ALLOWED_PATHS, ...TASK_PLANNING_ALLOWED_PATHS]
    : GOVERNANCE_ALLOWED_PATHS;
  return (
    governanceBranch &&
    changedFiles.length > 0 &&
    changedFiles.every((file) => allowedPaths.some((allowed) => isPathInside(file, allowed)))
  );
}
"""
if old not in content:
    raise RuntimeError('governance function changed')
save(path, content.replace(old, new, 1))

path = 'tests/unit/task-control.test.ts'
content = load(path)
anchor = "  it('reports forbidden and out-of-scope changes', () => {\n"
test = """  it('allows frozen task planning documents only on task-plan policy branches', () => {
    expect(
      isGovernanceOnlyPullRequest('policy/task-plan-renderer-architecture', [
        'docs/tasks/TASK_INDEX.md',
        'docs/tasks/M3/M3-07_RENDERER_REACT_FOUNDATION.md',
        'docs/product/V1_TASK_SYSTEM_REBASE.md',
      ]),
    ).toBe(true);
    expect(
      isGovernanceOnlyPullRequest('policy/ordinary-governance', [
        'docs/tasks/M3/M3-07_RENDERER_REACT_FOUNDATION.md',
      ]),
    ).toBe(false);
    expect(
      isGovernanceOnlyPullRequest('policy/task-plan-renderer-architecture', [
        'packages/core-service/src/index.ts',
      ]),
    ).toBe(false);
  });

"""
if test.strip() not in content:
    if anchor not in content:
        raise RuntimeError('test anchor missing')
    content = content.replace(anchor, test + anchor, 1)
save(path, content)

print('renderer task governance applied')
