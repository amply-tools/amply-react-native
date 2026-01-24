// Mock for react hooks used in SDK
module.exports = {
  useState: jest.fn((initial) => [initial, jest.fn()]),
  useEffect: jest.fn(),
  useCallback: jest.fn((fn) => fn),
  useRef: jest.fn((initial) => ({ current: initial })),
  useMemo: jest.fn((fn) => fn()),
};
