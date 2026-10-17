/**
 * `+native-intent` is the one place the Expo example hands links to Amply: a link Amply took is
 * sent to the home route, every other link is routed exactly as it arrived.
 */
const mockHandleUrl = jest.fn();

jest.mock('@amplytools/react-native-amply-sdk', () => ({
  __esModule: true,
  default: {handleUrl: (url: string) => mockHandleUrl(url)},
}));

import {redirectSystemPath} from '../app/+native-intent';

const route = (path: string) => redirectSystemPath({path, initial: true});

beforeEach(() => mockHandleUrl.mockReset());

test('sends a link Amply took to the home route', () => {
  mockHandleUrl.mockReturnValue(true);

  expect(route('amplyexpo://amply-debug/campaign?t=abc')).toBe('/');
  expect(mockHandleUrl).toHaveBeenCalledWith('amplyexpo://amply-debug/campaign?t=abc');
});

test.each([
  'amplyexpo://promo/amply-debug%2Fx',
  'amplyexpo://promo/amply-debug/x',
  'amplyexpo://promo/123',
])(
  'leaves the ordinary link %s unchanged',
  (path) => {
    mockHandleUrl.mockReturnValue(false);

    expect(route(path)).toBe(path);
  },
);

test('leaves a link unchanged when Amply does not recognise it', () => {
  mockHandleUrl.mockReturnValue(false);

  expect(route('amplyexpo://amply-debug/campaign')).toBe('amplyexpo://amply-debug/campaign');
});
