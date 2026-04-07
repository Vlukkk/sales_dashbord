import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import App from './App';
import { DataProvider } from './providers/DataProvider';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider
      locale={ruRU}
      theme={{
        token: {
          colorPrimary: '#2563eb',
          colorInfo: '#2563eb',
          colorSuccess: '#10b981',
          colorWarning: '#f59e0b',
          colorError: '#ef4444',
          colorBgBase: '#f5f7fb',
          colorTextBase: '#0f172a',
          colorBgContainer: '#ffffff',
          borderRadius: 10,
          fontFamily: "'Outfit', 'Segoe UI', sans-serif",
          controlHeight: 38,
        },
        components: {
          Table: {
            headerBg: '#f8fafc',
            headerColor: '#64748b',
            rowHoverBg: 'rgba(37, 99, 235, 0.04)',
          },
        },
      }}
    >
      <DataProvider>
        <App />
      </DataProvider>
    </ConfigProvider>
  </StrictMode>,
);
