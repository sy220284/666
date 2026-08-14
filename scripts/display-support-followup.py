from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding='utf-8')


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}: {old[:100]!r}')
    write(path, text.replace(old, new, 1))


# Keep this PR maintenance-only: physical display support does not require a product-code
# change to the first-launch window size.
replace_once(
    'apps/desktop/main/src/window-state.ts',
    'const defaultWindowWidth = 1_600;\nconst defaultWindowHeight = 1_000;',
    'const defaultWindowWidth = 1_280;\nconst defaultWindowHeight = 800;',
)
replace_once(
    'tests/unit/electron-window-state-coverage.test.ts',
    '      boundsDip: { x: 160, y: 40, width: 1600, height: 1000 },',
    '      boundsDip: { x: 320, y: 140, width: 1280, height: 800 },',
)
replace_once(
    'docs/ui/DISPLAY_SUPPORT_MAINTENANCE.md',
    '- 首次启动默认窗口调整为 1600×1000 DIP，并按可用工作区夹取。',
    '- 首次启动窗口默认尺寸属于窗口偏好与恢复策略，不作为物理显示器支持等级；本次维护不修改产品窗口默认值。',
)

# Current V1 product authorities must no longer present 1280/FHD as supported hardware.
replace_once(
    'docs/product/V1_SCOPE_AND_ACCEPTANCE.md',
    '- 1280×800可完成核心操作。\n- 2K 125%缩放下正文清晰且键入P95≤50ms。\n- 21:9下正文宽度受控，主要操作靠近工作区。',
    '- QHD（2560×1440）作为正式最低显示支持，可完成核心操作。\n- QHD 100/125/150/200%缩放下正文清晰且键入P95≤50ms。\n- QHD+、UWQHD与4K下正文宽度、纵向空间、主要操作距离和浮层边界合理。',
)
replace_once(
    'docs/product/FUNCTION_CATALOG.md',
    '| UI-007 | 响应式与DPI | 1280×800、2K、21:9和混合DPI | V1.0 P0 |',
    '| UI-007 | 响应式与DPI | QHD、QHD+、UWQHD、4K和混合DPI；窄CSS/DIP仅作降级 | V1.0 P0 |',
)
replace_once(
    'docs/product/V1.0_TRACEABILITY_MATRIX.md',
    '| REQ-041 | 1280×800、2K、21:9与混合DPI        | UI-006/007               | RESPONSIVE_AND_DPI、TEST_STRATEGY            | M0-06、M3-08—M3-10、M4-04、M8-02  | P0-063—066             | Verified |',
    '| REQ-041 | QHD/QHD+/UWQHD/4K与混合DPI        | UI-006/007               | RESPONSIVE_AND_DPI、TEST_STRATEGY            | M0-06、M3-08—M3-10、M4-04、M8-02  | P0-063—066             | Verified |',
)
replace_once(
    'docs/testing/P0_ACCEPTANCE_MATRIX.md',
    '| P0-063 | 1280×800   | 可完成写作、AI、建议稿和导出，无整页横向滚动 |\n| P0-064 | 2K高DPI    | 100/125/150%文字与图标清晰，布局不截断       |\n| P0-065 | 21:9       | 正文限宽，主要操作靠近工作区                 |',
    '| P0-063 | QHD最低支持 | 2560×1440可完成写作、AI、建议稿和导出，无整页横向滚动 |\n| P0-064 | QHD高DPI    | 100/125/150/200%文字与图标清晰，布局不截断          |\n| P0-065 | QHD+/UWQHD/4K | 16:10纵向空间合理；21:9正文限宽；4K浮层与缩放不越界 |',
)
replace_once(
    'docs/ui/UI_SYSTEM.md',
    '- 视觉回归覆盖Theme A浅/深/护眼/高对比、Theme B浅/深、1280×800、2K 125%和21:9。',
    '- 视觉回归覆盖Theme A/B关键状态；严格像素基线使用QHD 2560×1440，体验矩阵覆盖QHD 100/125/150/200%、QHD+、UWQHD、4K与混合DPI。',
)

# Guard the current authority files. Historical task/evidence documents are intentionally excluded.
for path, retired in {
    'docs/product/V1_SCOPE_AND_ACCEPTANCE.md': ['1280×800可完成核心操作'],
    'docs/product/FUNCTION_CATALOG.md': ['UI-007 | 响应式与DPI | 1280×800'],
    'docs/product/V1.0_TRACEABILITY_MATRIX.md': ['REQ-041 | 1280×800'],
    'docs/testing/P0_ACCEPTANCE_MATRIX.md': ['P0-063 | 1280×800'],
    'docs/ui/UI_SYSTEM.md': ['Theme B浅/深、1280×800'],
}.items():
    source = read(path)
    for needle in retired:
        if needle in source:
            raise SystemExit(f'{path}: retired current display requirement remains: {needle}')
