import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AssistantActionRouter } from './assistant-action-router';

let mockLoaded = false;
let mockNavigation: { key: string } | undefined;
let mockPathname = '/';
let mockPending: string | null = 'next-flight';
let mockListener: (() => void) | undefined;
const mockRouter = { push: jest.fn() };
const mockTake = jest.fn(() => { const action = mockPending; mockPending = null; return action; });
const mockRemove = jest.fn();

jest.mock('@clerk/expo', () => ({ useAuth: () => ({ isLoaded: mockLoaded }) }));
jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  useRootNavigationState: () => mockNavigation,
  useRouter: () => mockRouter,
}));
jest.mock('../../modules/flyright-assistant', () => ({
  takePendingAssistantAction: () => mockTake(),
  addAssistantActionListener: (callback: () => void) => { mockListener = callback; return { remove: mockRemove }; },
}));

let tree: ReactTestRenderer;
beforeEach(() => {
  jest.clearAllMocks();
  mockLoaded = false;
  mockNavigation = undefined;
  mockPathname = '/';
  mockPending = 'next-flight';
  mockListener = undefined;
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); });

async function render() {
  await act(async () => { tree = create(<AssistantActionRouter />); });
}
async function update() {
  await act(async () => tree.update(<AssistantActionRouter />));
}

it('retains a cold Siri request until both authentication and navigation are ready', async () => {
  await render();
  expect(mockTake).not.toHaveBeenCalled();
  mockLoaded = true;
  await update();
  expect(mockTake).not.toHaveBeenCalled();
  mockNavigation = { key: 'root' };
  await update();
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/assistant/[action]', params: { action: 'next-flight' } });
  expect(mockPending).toBeNull();
});

it.each(['/onboarding', '/sign-in'])('retains requests while %s is visible', async path => {
  mockLoaded = true;
  mockNavigation = { key: 'root' };
  mockPathname = path;
  await render();
  expect(mockTake).not.toHaveBeenCalled();
  mockPathname = '/';
  await update();
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
});

it('handles warm invocations once and discards unsupported actions', async () => {
  mockLoaded = true;
  mockNavigation = { key: 'root' };
  mockPending = null;
  await render();
  mockPending = 'boarding-pass';
  await act(async () => mockListener?.());
  await act(async () => mockListener?.());
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
  mockPending = 'delete-trip';
  await act(async () => mockListener?.());
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
});
