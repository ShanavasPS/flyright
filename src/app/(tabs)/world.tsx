import { LazyTab } from '@/components/lazy-tab';
import { World } from '@/screens/world';

export default function WorldRoute() {
  return (
    <LazyTab>
      <World />
    </LazyTab>
  );
}
