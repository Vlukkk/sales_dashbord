import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, theme } from 'antd';
import App from './App';
import { DataProvider } from './providers/DataProvider';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#67d9ff',
          colorInfo: '#67d9ff',
          colorSuccess: '#79f1c4',
          colorWarning: '#ffc76a',
          colorBgBase: '#09111d',
          colorTextBase: '#eff4ff',
          borderRadius: 16,
          fontFamily: "'Outfit', 'Segoe UI', sans-serif",
          colorBorderSecondary: 'rgba(255,255,255,0.08)',
          controlHeight: 42,
        },
        components: {
          Select: {
            colorBgContainer: 'rgba(255,255,255,0.04)',
            colorTextPlaceholder: '#7e93bb',
          },
          Input: {
            colorBgContainer: 'rgba(255,255,255,0.04)',
            colorTextPlaceholder: '#7e93bb',
          },
          DatePicker: {
            colorBgContainer: 'rgba(255,255,255,0.04)',
            colorTextPlaceholder: '#7e93bb',
          },
          Table: {
            headerBg: 'rgba(255,255,255,0.03)',
            headerColor: '#9db1d6',
            rowHoverBg: 'rgba(103, 217, 255, 0.05)',
            colorBgContainer: 'transparent',
            borderColor: 'rgba(255,255,255,0.06)',
          },
          Drawer: {
            colorBgElevated: '#0f172a',
          },
          Collapse: {
            headerBg: 'transparent',
            contentBg: 'transparent',
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
