import { createRoot } from 'react-dom/client';
import App from './App';
import { StoreProvider } from './state/store';
import { ToastProvider } from './state/toast';
import './styles/base.css';
import './styles/glass.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/features.css';

createRoot(document.getElementById('root')!).render(
  <StoreProvider>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StoreProvider>,
);
