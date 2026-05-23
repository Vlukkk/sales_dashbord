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
          colorPrimary: '#4f46e5',
          colorInfo: '#4f46e5',
          colorSuccess: '#059669',
          colorWarning: '#d97706',
          colorError: '#e11d48',
          colorBgBase: '#f4f7fc',
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
            rowHoverBg: 'rgba(79, 70, 229, 0.04)',
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
