import 'fake-indexeddb/auto';

// Tell React that the test environment supports act(...)
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
