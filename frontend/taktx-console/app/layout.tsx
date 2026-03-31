import type { Metadata } from "next";
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ConfigProvider, theme } from 'antd';
import { App as AntApp } from 'antd';
import ShellLayout from '@/components/layout/ShellLayout';
import AntdClientSetup from '@/components/AntdClientSetup';
import "./globals.css";

export const metadata: Metadata = {
  title: "TaktX Console",
  description: "Process monitoring and management console for TaktX",
  icons: {
    icon: '/favicon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AntdRegistry>
          <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
            <AntApp>
              <AntdClientSetup />
              <ShellLayout>
                {children}
              </ShellLayout>
            </AntApp>
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
