import { createRequire } from 'node:module';

import type { createElement as createReactElement } from 'react';
import type { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AuthorErrorNotice } from '../../apps/desktop/renderer/src/components/author-error-notice.js';

const rendererRequire = createRequire(
  new URL('../../apps/desktop/renderer/package.json', import.meta.url),
);
const { createElement } = rendererRequire('react') as {
  readonly createElement: typeof createReactElement;
};
const { renderToStaticMarkup } = rendererRequire('react-dom/server') as {
  readonly renderToStaticMarkup: typeof renderReactToStaticMarkup;
};

describe('AuthorErrorNotice 展示分支', () => {
  it('错误没有建议操作时只展示错误正文', () => {
    const markup = renderToStaticMarkup(
      createElement(AuthorErrorNotice, {
        error: { code: 'COMMON_CANCELLED_004', message: 'ignored' },
      }),
    );

    expect(markup).toContain('操作已取消');
    expect(markup).toContain('class="form-error"');
    expect(markup.match(/<p>/g)).toHaveLength(1);
  });
});
