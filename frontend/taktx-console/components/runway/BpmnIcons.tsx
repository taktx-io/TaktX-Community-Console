"use client";

import React from 'react';

export type BpmnElementType =
  | 'startEvent'
  | 'endEvent'
  | 'intermediateEvent'
  | 'timerEvent'
  | 'messageEvent'
  | 'task'
  | 'userTask'
  | 'serviceTask'
  | 'businessRuleTask'
  | 'subProcess'
  | 'exclusiveGateway'
  | 'parallelGateway'
  | 'inclusiveGateway';

interface IconProps {
  size?: number;
  stroke?: string;
  fill?: string;
}

function Circle({ size = 16, stroke = '#595959', fill = 'none' }: IconProps) {
  const s = size;
  const r = s / 2 - 1;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden>
      <circle cx={s / 2} cy={s / 2} r={r} stroke={stroke} strokeWidth={1.5} fill={fill} />
    </svg>
  );
}

function RoundedRect({ size = 16, stroke = '#595959', fill = 'none' }: IconProps) {
  const s = size;
  const r = 2.5;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden>
      <rect x={1.2} y={2} width={s - 2.4} height={s - 4} rx={r} ry={r} stroke={stroke} strokeWidth={1.5} fill={fill} />
    </svg>
  );
}

function Diamond({ size = 16, stroke = '#595959', fill = 'none' }: IconProps) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden>
      <polygon
        points={`${s / 2},1 ${s - 1},${s / 2} ${s / 2},${s - 1} 1,${s / 2}`}
        stroke={stroke}
        strokeWidth={1.5}
        fill={fill}
      />
    </svg>
  );
}

export function StartEventIcon(props: IconProps) {
  return <Circle {...props} stroke={props.stroke ?? '#52c41a'} />;
}
export function EndEventIcon(props: IconProps) {
  return <Circle {...props} stroke={props.stroke ?? '#8c8c8c'} fill="#f0f0f0" />;
}
export function IntermediateEventIcon(props: IconProps) {
  return <Circle {...props} stroke={props.stroke ?? '#1677ff'} />;
}
export function TimerEventIcon({ size = 16, stroke }: IconProps) {
  const s = size;
  const r = s / 2 - 1.5;
  const c = stroke ?? '#1677ff';
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden>
      <circle cx={s / 2} cy={s / 2} r={r} stroke={c} strokeWidth={1.5} fill="none" />
      <line x1={s / 2} y1={s / 2} x2={s / 2} y2={s / 4} stroke={c} strokeWidth={1.3} />
      <line x1={s / 2} y1={s / 2} x2={(3 * s) / 4} y2={s / 2} stroke={c} strokeWidth={1.3} />
    </svg>
  );
}
export function MessageEventIcon({ size = 16, stroke }: IconProps) {
  const s = size;
  const c = stroke ?? '#1677ff';
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden>
      <circle cx={s / 2} cy={s / 2} r={s / 2 - 1.2} stroke={c} strokeWidth={1.5} fill="none" />
      <polyline
        points={`${s * 0.25},${s * 0.40} ${s * 0.5},${s * 0.55} ${s * 0.75},${s * 0.40}`}
        stroke={c}
        strokeWidth={1.2}
        fill="none"
      />
      <rect x={s * 0.27} y={s * 0.40} width={s * 0.46} height={s * 0.22} stroke={c} strokeWidth={1.2} fill="none" />
    </svg>
  );
}
export function TaskIcon(props: IconProps) {
  return <RoundedRect {...props} stroke={props.stroke ?? '#595959'} />;
}
export function UserTaskIcon({ size = 16, stroke }: IconProps) {
  const s = size;
  const c = stroke ?? '#1677ff';
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden>
      <rect x={1.2} y={2} width={s - 2.4} height={s - 4} rx={2.5} ry={2.5} stroke={c} strokeWidth={1.5} fill="none" />
      <circle cx={s / 2} cy={s * 0.48} r={s * 0.14} stroke={c} strokeWidth={1.2} fill="none" />
      <path d={`M ${s * 0.34} ${s * 0.68} C ${s * 0.4} ${s * 0.58}, ${s * 0.6} ${s * 0.58}, ${s * 0.66} ${s * 0.68}`} stroke={c} strokeWidth={1.2} fill="none" />
    </svg>
  );
}
export function ServiceTaskIcon({ size = 16, stroke }: IconProps) {
  const s = size;
  const c = stroke ?? '#13c2c2';
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden>
      <rect x={1.2} y={2} width={s - 2.4} height={s - 4} rx={2.5} ry={2.5} stroke={c} strokeWidth={1.5} fill="none" />
      <path d={`M ${s * 0.36} ${s * 0.56} l ${s * 0.06} ${-s * 0.06} l ${s * 0.10} ${s * 0.10} l ${-s * 0.06} ${s * 0.06} z`} fill={c} />
      <circle cx={s * 0.62} cy={s * 0.42} r={s * 0.07} fill={c} />
    </svg>
  );
}
export function CallActivityIcon({ size = 16, stroke }: IconProps) {
  const s = size;
  const c = stroke ?? '#722ed1';
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden>
      <rect x={1.2} y={2} width={s - 2.4} height={s - 4} rx={2.5} ry={2.5} stroke={c} strokeWidth={1.5} fill="none" />
      <rect x={2.6} y={3.4} width={s - 5.2} height={s - 6.8} rx={2} ry={2} stroke={c} strokeWidth={1.2} fill="none" />
    </svg>
  );
}
export function SubProcessIcon({ size = 16, stroke }: IconProps) {
  const s = size;
  const c = stroke ?? '#fa8c16';
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden>
      <rect x={1.2} y={2} width={s - 2.4} height={s - 4} rx={2.5} ry={2.5} stroke={c} strokeWidth={1.5} fill="none" />
      <line x1={s / 2 - 3} y1={s / 2} x2={s / 2 + 3} y2={s / 2} stroke={c} strokeWidth={1.4} />
      <line x1={s / 2} y1={s / 2 - 3} x2={s / 2} y2={s / 2 + 3} stroke={c} strokeWidth={1.4} />
    </svg>
  );
}
export function BusinessRuleTaskIcon({ size = 16, stroke }: IconProps) {
  const s = size;
  const c = stroke ?? '#eb2f96';
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden>
      <rect x={1.2} y={2} width={s - 2.4} height={s - 4} rx={2.5} ry={2.5} stroke={c} strokeWidth={1.5} fill="none" />
      {/* Header bar mimicking a decision table header */}
      <rect x={1.2} y={2} width={s - 2.4} height={(s - 4) * 0.38} rx={2.5} ry={2.5} stroke={c} strokeWidth={0} fill={c} fillOpacity={0.18} />
      {/* Vertical divider */}
      <line x1={s * 0.5} y1={2} x2={s * 0.5} y2={s - 2} stroke={c} strokeWidth={1} />
      {/* Horizontal divider between header and rows */}
      <line x1={1.2} y1={s * 0.42} x2={s - 1.2} y2={s * 0.42} stroke={c} strokeWidth={1} />
    </svg>
  );
}
export function ExclusiveGatewayIcon({ size = 16, stroke }: IconProps) {
  const s = size;
  const c = stroke ?? '#fa8c16';
  return (
    <div style={{ position: 'relative', width: s, height: s }}>
      <Diamond size={s} stroke={c} />
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ position: 'absolute', left: 0, top: 0 }} aria-hidden>
        <line x1={3} y1={3} x2={s - 3} y2={s - 3} stroke={c} strokeWidth={1.3} />
        <line x1={s - 3} y1={3} x2={3} y2={s - 3} stroke={c} strokeWidth={1.3} />
      </svg>
    </div>
  );
}
export function ParallelGatewayIcon({ size = 16, stroke }: IconProps) {
  const s = size;
  const c = stroke ?? '#fa8c16';
  return (
    <div style={{ position: 'relative', width: s, height: s }}>
      <Diamond size={s} stroke={c} />
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ position: 'absolute', left: 0, top: 0 }} aria-hidden>
        <line x1={s / 2} y1={3} x2={s / 2} y2={s - 3} stroke={c} strokeWidth={1.3} />
        <line x1={3} y1={s / 2} x2={s - 3} y2={s / 2} stroke={c} strokeWidth={1.3} />
      </svg>
    </div>
  );
}
export function InclusiveGatewayIcon({ size = 16, stroke }: IconProps) {
  const s = size;
  const c = stroke ?? '#fa8c16';
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden>
      <polygon points={`${s / 2},1 ${s - 1},${s / 2} ${s / 2},${s - 1} 1,${s / 2}`} stroke={c} strokeWidth={1.5} fill="none" />
      <circle cx={s / 2} cy={s / 2} r={s / 4} stroke={c} strokeWidth={1.2} fill="none" />
    </svg>
  );
}

export function BpmnIcon({ type, size = 16, color }: { type?: string; size?: number; color?: string }) {
  const stroke = color;
  switch ((type || '').toLowerCase()) {
    case 'startevent':
      return <StartEventIcon size={size} stroke={stroke} />;
    case 'endevent':
      return <EndEventIcon size={size} stroke={stroke} />;
    case 'intermediateevent':
      return <IntermediateEventIcon size={size} stroke={stroke} />;
    case 'timerevent':
      return <TimerEventIcon size={size} stroke={stroke} />;
    case 'messageevent':
      return <MessageEventIcon size={size} stroke={stroke} />;
    case 'usertask':
      return <UserTaskIcon size={size} stroke={stroke} />;
    case 'servicetask':
      return <ServiceTaskIcon size={size} stroke={stroke} />;
    case 'callactivity':
      return <CallActivityIcon size={size} stroke={stroke} />;
    case 'subprocess':
      return <SubProcessIcon size={size} stroke={stroke} />;
    case 'businessruletask':
      return <BusinessRuleTaskIcon size={size} stroke={stroke} />;
    case 'exclusivegateway':
      return <ExclusiveGatewayIcon size={size} stroke={stroke} />;
    case 'parallelgateway':
      return <ParallelGatewayIcon size={size} stroke={stroke} />;
    case 'inclusivegateway':
      return <InclusiveGatewayIcon size={size} stroke={stroke} />;
    case 'task':
    default:
      return <TaskIcon size={size} stroke={stroke} />;
  }
}
