import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { PRIVATE_ROUTE_PARAMS, PUBLIC_ROUTE_PARAMS } from './observe-config';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

/** Every key named in a useLocalSearchParams / useGlobalSearchParams generic. */
function paramsReadByScreens(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of sources(join(__dirname, '..'))) {
    const source = readFileSync(file, 'utf8');
    for (const [, body] of source.matchAll(/use(?:Local|Global)SearchParams<\s*\{([\s\S]*?)\}\s*>/g)) {
      const withoutComments = body.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      for (const [, key] of withoutComments.matchAll(/([A-Za-z_]\w*)\??\s*:/g)) {
        if (!found.has(key)) found.set(key, file);
      }
    }
  }
  return found;
}

it('classifies every route param as private or public for EAS Observe', () => {
  const classified = new Set<string>([...PRIVATE_ROUTE_PARAMS, ...PUBLIC_ROUTE_PARAMS]);
  const read = paramsReadByScreens();
  expect(read.size).toBeGreaterThan(20);
  const unlisted = [...read].filter(([key]) => !classified.has(key)).map(([key, file]) => `${key} (${file})`);
  expect(unlisted).toEqual([]);
});

it('never lists a param as both', () => {
  const pub = new Set<string>(PUBLIC_ROUTE_PARAMS);
  expect(PRIVATE_ROUTE_PARAMS.filter((key) => pub.has(key))).toEqual([]);
});

it('keeps tokens, people and trip facts out of the exported URL', () => {
  for (const key of ['token', 'id', 'journeyId', 'userId', 'flight', 'date', 'from', 'to', 'name', 'uri']) {
    expect(PRIVATE_ROUTE_PARAMS).toContain(key);
  }
});

it('hides the URL of a shared trip but keeps its UI switches (expo-observe’s own filter)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getNavigationMetricParams } = require(join(__dirname, '../../node_modules/expo-observe/src/integrations/navigationConfig'));
  const config = { filteredParams: [...PRIVATE_ROUTE_PARAMS] };
  expect(getNavigationMetricParams(config, { token: 'cAX4secret' }, '/t/cAX4secret')).toEqual({
    routeParams: {}, urlHidden: true,
  });
  expect(getNavigationMetricParams(config, { id: 'AA79-2026-10-04', from: 'LHR', to: 'DFW', focus: 'map' }, '/journey/AA79-2026-10-04'))
    .toEqual({ routeParams: { focus: 'map' }, urlHidden: true });
  expect(getNavigationMetricParams(config, { tab: 'followers' }, '/people?tab=followers'))
    .toEqual({ routeParams: { tab: 'followers' }, url: '/people?tab=followers' });
});
