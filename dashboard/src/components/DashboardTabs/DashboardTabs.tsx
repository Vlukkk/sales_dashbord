import { AppstoreOutlined, CalculatorOutlined } from '@ant-design/icons';
import { Tabs, type TabsProps } from 'antd';

export default function DashboardTabs(props: TabsProps) {
  return (
    <Tabs
      {...props}
      className="dashboard-tabs"
      tabBarGutter={8}
      items={props.items?.map((item) => ({
        ...item,
        label: item.key === 'dashboard' ? 'Обзор' : 'Маржа FBM',
        icon: item.key === 'dashboard' ? <AppstoreOutlined aria-hidden /> : <CalculatorOutlined aria-hidden />,
      }))}
    />
  );
}
