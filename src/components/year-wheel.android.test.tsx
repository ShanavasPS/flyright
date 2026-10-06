import { ScrollView } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { tick } from '@/services/haptics';

import { YearWheel } from './year-wheel.android';

jest.mock('@/services/haptics', () => ({ tick: jest.fn() }));
jest.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ field: '#eee' }) }));
jest.mock('@/components/themed-text', () => ({ ThemedText: () => null }));

const ROW = 44;
const years = [2022, 2023, 2024, 2025, 2026];

function scrollTo(tree: ReactTestRenderer, y: number) {
  act(() => {
    tree.root.findByType(ScrollView).props.onScroll({ nativeEvent: { contentOffset: { y } } });
  });
}

describe('YearWheel (Android)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ticks once per year passing the band, not per scroll event', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<YearWheel value={2026} years={years} onChange={() => {}} />);
    });
    // Starts on 2026 (row 4): small movements within that row stay silent.
    scrollTo(tree, 4 * ROW);
    scrollTo(tree, 4 * ROW - 10);
    expect(tick).not.toHaveBeenCalled();
    // Two rows up, one event per few pixels: two ticks.
    for (let y = 4 * ROW; y >= 2 * ROW; y -= 8) scrollTo(tree, y);
    expect(tick).toHaveBeenCalledTimes(2);
    // Landing on the first year ticks once; overscrolling past it is silent.
    scrollTo(tree, -200);
    scrollTo(tree, -400);
    expect(tick).toHaveBeenCalledTimes(3);
  });
});
