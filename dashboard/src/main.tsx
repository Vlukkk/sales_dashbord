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
          colorSuccess: '#059669',
          colorWarning: '#d97706',
          colorError: '#e11d48',
          colorBgBase: '#f5f6f8',
          colorTextBase: '#0f172a',
          colorBgContainer: '#ffffff',
          borderRadius: 6,
          fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
          controlHeight: 38,
        },
        components: {
          Table: {
            headerBg: '#f3f5f8',
            headerColor: '#475569',
            rowHoverBg: '#eff6ff',
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
