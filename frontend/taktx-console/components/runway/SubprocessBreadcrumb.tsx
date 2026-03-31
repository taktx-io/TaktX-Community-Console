'use client';

import { Breadcrumb } from 'antd';
import { HomeOutlined, FolderOutlined } from '@ant-design/icons';

// Define the navigation path item type locally
interface NavigationPathItem {
  id: string;
  name: string;
}

interface SubprocessBreadcrumbProps {
  path: NavigationPathItem[];
  onNavigate: (elementId: string) => void;
}

export default function SubprocessBreadcrumb({ path, onNavigate }: Readonly<SubprocessBreadcrumbProps>) {
  // Don't show breadcrumb if we're at root level (only one item in path)
  if (path.length <= 1) {
    return null;
  }

  const breadcrumbItems = path.map((item, index) => {
    const isLast = index === path.length - 1;
    const isRoot = index === 0;

    return {
      key: item.id,
      title: (
        <span
          onClick={() => !isLast && onNavigate(item.id)}
          style={{
            cursor: isLast ? 'default' : 'pointer',
            color: isLast ? '#000000' : '#1677ff',
            fontWeight: isLast ? 600 : 400,
            fontSize: '13px',
          }}
        >
          {isRoot ? (
            <>
              <HomeOutlined style={{ marginRight: 4 }} />
              {item.name}
            </>
          ) : (
            <>
              <FolderOutlined style={{ marginRight: 4 }} />
              {item.name}
            </>
          )}
        </span>
      ),
    };
  });

  return (
    <div
      style={{
        padding: '8px 16px',
        background: '#f0f7ff',
        borderTop: '1px solid #d6e4ff',
        borderBottom: '1px solid #91caff',
        display: 'flex',
        alignItems: 'center',
        minHeight: '40px',
        marginBottom: '8px',
      }}
    >
      <span style={{
        marginRight: '12px',
        color: '#666',
        fontSize: '12px',
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}>
        Navigation:
      </span>
      <Breadcrumb
        items={breadcrumbItems}
        separator="›"
        style={{ fontSize: '13px' }}
      />
    </div>
  );
}

