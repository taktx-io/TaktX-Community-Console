'use client';

import { Card, Row, Col, Typography } from 'antd';
import Link from 'next/link';
import { DashboardOutlined } from '@ant-design/icons';

const { Title, Paragraph } = Typography;
export default function Home() {
  return (
    <div>
      <Row gutter={[24, 24]}>
        <Col xs={24} md={12} lg={10}>
          <Link href="/runway" style={{ textDecoration: 'none' }}>
            <Card
              hoverable
              style={{ height: '100%' }}
            >
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <DashboardOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '16px' }} />
                <Title level={3}>Runway</Title>
                <Paragraph>
                  Monitor and visualize process definitions and instances in real-time.
                  View BPMN diagrams, inspect variables and flow nodes, and start/cancel instances.
                </Paragraph>
              </div>
            </Card>
          </Link>
        </Col>
      </Row>
    </div>
  );
}
