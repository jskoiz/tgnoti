// Import jest-dom extensions
import '@testing-library/jest-dom';

// Mock the global fetch function
global.fetch = jest.fn();

// Mock window.location
Object.defineProperty(window, 'location', {
  writable: true,
  value: {
    reload: jest.fn(),
  },
});

// Mock socket.io-client
jest.mock('socket.io-client', () => {
  const mockSocket = {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };
  return {
    io: jest.fn(() => mockSocket),
  };
});

// Mock chart.js
jest.mock('chart.js', () => ({
  Chart: {
    register: jest.fn(),
  },
  CategoryScale: jest.fn(),
  LinearScale: jest.fn(),
  PointElement: jest.fn(),
  LineElement: jest.fn(),
  Title: jest.fn(),
  Tooltip: jest.fn(),
  Legend: jest.fn(),
}));

// Mock react-chartjs-2
jest.mock('react-chartjs-2', () => ({
  Line: jest.fn().mockImplementation(() => {
    return { type: 'Line' };
  }),
}));