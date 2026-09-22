import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/fira-sans/400.css';
import '@fontsource/fira-sans/500.css';
import '@fontsource/fira-sans/600.css';
import '@fontsource/fira-code/400.css';
import '@fontsource/fira-code/500.css';
import '@fontsource/fira-code/600.css';
import './index.css';
import { AuthProvider } from './auth/AuthProvider';
import { Root } from './Root';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </StrictMode>,
);
