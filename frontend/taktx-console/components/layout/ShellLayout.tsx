'use client';

import { useState } from 'react';
import { Layout, Menu } from 'antd';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { DashboardOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import React from 'react';
import { APP_VERSION } from '@/lib/config/env';

const { Sider, Header, Content } = Layout;

interface ShellLayoutProps {
  children: React.ReactNode;
}

export default function ShellLayout({ children }: Readonly<ShellLayoutProps>) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  const getSelectedKey = () => {
    if (pathname.startsWith('/runway')) return 'runway';
    return 'runway';
  };

  const getPageTitle = () => {
    if (pathname.startsWith('/runway')) return 'Runway – Process Monitoring';
    return 'TaktX Community Console';
  };

  const getPageSubtitle = () => {
    if (pathname.startsWith('/runway')) return 'Select a process definition and version to view its BPMN diagram and monitor instances.';
    return 'Community edition focused on process visibility and control.';
  };

  const menuItems = [
    {
      key: 'runway',
      icon: <DashboardOutlined />,
      label: 'Runway',
    },
  ];

  const handleMenuClick = (e: { key: string }) => {
    router.push(`/${e.key}`);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        theme="dark"
        width={250}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        collapsedWidth={80}
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        <div style={{
          padding: collapsed ? '16px 12px' : '16px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          height: '64px',
          transition: 'all 0.2s'
        }}>
          <Image
            key={collapsed ? 'square' : 'wide'}
            src={collapsed ? "/taktx-logo-square-transparent.png" : "/taktx-logo-transparent.png"}
            alt="TaktX Logo"
            width={collapsed ? 48 : 160}
            height={collapsed ? 48 : 40}
            style={{
              width: collapsed ? '48px' : 'auto',
              height: collapsed ? '48px' : '40px',
              objectFit: 'contain',
              maxWidth: '100%'
            }}
          />
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[getSelectedKey()]}
          items={menuItems}
          onClick={handleMenuClick}
        />
        {/* Version badge — hidden when sidebar is collapsed */}
        {!collapsed && (
          <div style={{
            marginTop: 'auto',
            padding: '12px 16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            color: 'rgba(255, 255, 255, 0.35)',
            fontSize: '11px',
            textAlign: 'center',
            letterSpacing: '0.03em',
            userSelect: 'none',
          }}>
            v{APP_VERSION}
          </div>
        )}
      </Sider>
      <Layout style={{ display: 'flex', flexDirection: 'column' }}>
        <Header style={{
          background: '#001529',
          color: 'white',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          height: 'auto',
          lineHeight: 'normal',
          flexShrink: 0
        }}>
          {React.createElement(collapsed ? MenuUnfoldOutlined : MenuFoldOutlined, {
            onClick: () => setCollapsed(!collapsed),
            style: { fontSize: '18px', cursor: 'pointer', flexShrink: 0 }
          })}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: '18px', fontWeight: 500, lineHeight: '1.3' }}>{getPageTitle()}</span>
            <span style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.65)', lineHeight: '1.4' }}>{getPageSubtitle()}</span>
          </div>
          {/* No auth/account controls in community mode */}
        </Header>
        <Content style={{ margin: 0, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}

