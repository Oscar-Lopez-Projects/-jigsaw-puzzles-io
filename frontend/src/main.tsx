import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './context/AuthContext';
import { PuzzleLayoutProvider } from './context/PuzzleLayoutContext';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <PuzzleLayoutProvider>
        <App />
      </PuzzleLayoutProvider>
    </AuthProvider>
  </StrictMode>,
);
