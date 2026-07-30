import { describe, expect, it } from 'vitest';

import {
  RequestGeneration,
  RequestGenerationGroup,
} from '../../apps/desktop/renderer/src/runtime/request-generation.js';

describe('异步查询请求代次', () => {
  it('同一作品内后发请求使先发响应失效', () => {
    const requests = new RequestGeneration();
    const first = requests.begin();
    const second = requests.begin();
    expect(requests.isCurrent(first)).toBe(false);
    expect(requests.isCurrent(second)).toBe(true);
  });

  it('切换作品或卸载页面后使所有在途响应失效', () => {
    const requests = new RequestGeneration();
    const pending = requests.begin();
    requests.invalidate();
    expect(requests.isCurrent(pending)).toBe(false);
  });

  it('不同请求通道互不失效，同一通道仍只接受最新响应', () => {
    const requests = new RequestGenerationGroup<'search' | 'dictionary'>();
    const search = requests.begin('search');
    const firstDictionary = requests.begin('dictionary');
    const secondDictionary = requests.begin('dictionary');

    expect(requests.isCurrent('search', search)).toBe(true);
    expect(requests.isCurrent('dictionary', firstDictionary)).toBe(false);
    expect(requests.isCurrent('dictionary', secondDictionary)).toBe(true);
  });

  it('作品切换使全部请求通道同时失效', () => {
    const requests = new RequestGenerationGroup<'search' | 'replace' | 'dictionary' | 'index'>();
    const generations = {
      search: requests.begin('search'),
      replace: requests.begin('replace'),
      dictionary: requests.begin('dictionary'),
      index: requests.begin('index'),
    };

    requests.invalidateAll();

    expect(requests.isCurrent('search', generations.search)).toBe(false);
    expect(requests.isCurrent('replace', generations.replace)).toBe(false);
    expect(requests.isCurrent('dictionary', generations.dictionary)).toBe(false);
    expect(requests.isCurrent('index', generations.index)).toBe(false);
  });
});
