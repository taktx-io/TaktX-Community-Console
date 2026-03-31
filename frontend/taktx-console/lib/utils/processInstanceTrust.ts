import type {
  CommandTrustMetadata,
  TimedFlowNodeInstance,
  TimedFlowNodeUpdate,
} from '@/lib/api/processInstanceApi';

export interface ActivityRow {
  key: string;
  timestampMs: number;
  timeLabel: string;
  activity: string;
  current: ActivityTrustSnapshot;
  origin?: ActivityTrustSnapshot | null;
}

export interface ActivityTrustSnapshot {
  scope: 'current' | 'origin';
  scopeLabel: string;
  actor: string;
  trustLabel: string;
  trustColor: string;
  trustBadges?: ActivityTrustBadge[];
  detail?: string;
}

export interface ActivityTrustBadge {
  key: string;
  label: string;
  color: string;
  actor?: string;
}

export interface TrustFact {
  key: string;
  label: string;
  color?: string;
  detail?: string;
}

interface BuildSelectedFlowNodeActivityRowsOptions {
  selectedFlowNodeInstance: TimedFlowNodeInstance | null;
}

interface BuildSelectedFlowNodeTrustFactsOptions {
  selectedFlowNodeInstance: TimedFlowNodeInstance | null;
}

const VERIFICATION_LABELS: Record<string, string> = {
  JWT_AUTHORIZED: 'JWT authorised',
  SIGNATURE_VERIFIED: 'Signature verified',
  AUTHORIZATION_DISABLED: 'Authorization disabled',
  LICENSE_BYPASSED: 'License bypassed',
};

const AUTH_METHOD_LABELS: Record<string, string> = {
  JWT: 'JWT',
  ED25519: 'Ed25519',
  JWT_AND_ED25519: 'JWT + Ed25519',
  NONE: 'None',
};

const JWT_AUTH_METHODS = new Set(['JWT', 'JWT_AND_ED25519']);
const ED25519_AUTH_METHODS = new Set(['ED25519', 'JWT_AND_ED25519']);

const TRUST_METADATA_KEYS = [
  'authMethod',
  'verificationResult',
  'trusted',
  'userId',
  'issuer',
  'signerKeyId',
  'signerOwner',
  'signerAlgorithm',
] as const;

export function formatTimestampWithMs(value?: string | number | null): string {
  if (value == null) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  return `${date.toLocaleString()}.${ms}`;
}

function normalizeHistory(instance: TimedFlowNodeInstance | null): TimedFlowNodeUpdate[] {
  if (!instance) return [];
  if (instance.updateHistory?.length) {
    return [...instance.updateHistory].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  return [
    {
      timestamp: instance.timestamp,
      flowNodeInstanceUpdate: instance.flowNodeInstanceUpdate,
    },
  ];
}

function getStateName(update: TimedFlowNodeUpdate): string {
  const rawState = update.flowNodeInstanceUpdate?.flowNodeInstance?.state;
  if (typeof rawState === 'object' && rawState !== null && 'name' in rawState) {
    return String(rawState.name || 'UNKNOWN');
  }
  return typeof rawState === 'string' && rawState ? rawState : 'UNKNOWN';
}

function getTrustMetadata(update: TimedFlowNodeUpdate): {
  current: CommandTrustMetadata | null;
  origin: CommandTrustMetadata | null;
} {
  return {
    current:
      update.flowNodeInstanceUpdate?.currentTrustMetadata
      ?? update.flowNodeInstanceUpdate?.commandTrustMetadata
      ?? null,
    origin: update.flowNodeInstanceUpdate?.originTrustMetadata ?? null,
  };
}

function areTrustMetadataEquivalent(
  left: CommandTrustMetadata | null,
  right: CommandTrustMetadata | null
): boolean {
  if (!left || !right) return false;
  return TRUST_METADATA_KEYS.every(key => (left[key] ?? null) === (right[key] ?? null));
}

function getTrustLabel(metadata: CommandTrustMetadata | null): string {
  if (!metadata) return 'No trust metadata';
  const verification = metadata.verificationResult ? VERIFICATION_LABELS[metadata.verificationResult] : null;
  if (verification) return verification;
  if (metadata.trusted === true) return 'Trusted';
  if (metadata.trusted === false) return 'Untrusted';
  return 'Trust unknown';
}

function getTrustColor(metadata: CommandTrustMetadata | null): string {
  if (!metadata) return 'default';
  if (metadata.trusted === false) return 'red';
  switch (metadata.verificationResult) {
    case 'JWT_AUTHORIZED':
      return 'green';
    case 'SIGNATURE_VERIFIED':
      return 'blue';
    case 'AUTHORIZATION_DISABLED':
      return 'orange';
    case 'LICENSE_BYPASSED':
      return 'purple';
    default:
      return metadata.trusted ? 'green' : 'default';
  }
}

function hasJwtTrustInfo(metadata: CommandTrustMetadata | null): boolean {
  if (!metadata) return false;
  return JWT_AUTH_METHODS.has(metadata.authMethod || '') || Boolean(metadata.userId || metadata.issuer);
}

function hasEd25519TrustInfo(metadata: CommandTrustMetadata | null): boolean {
  if (!metadata) return false;
  return ED25519_AUTH_METHODS.has(metadata.authMethod || '')
    || Boolean(metadata.signerOwner || metadata.signerAlgorithm || metadata.signerKeyId);
}

function getSignerLabel(metadata: CommandTrustMetadata): string | null {
  return metadata.signerOwner || metadata.signerKeyId || metadata.signerAlgorithm || null;
}

function getJwtActorLabel(metadata: CommandTrustMetadata): string | null {
  return metadata.userId || metadata.issuer || null;
}

function getEd25519ActorLabel(metadata: CommandTrustMetadata): string | null {
  return getSignerLabel(metadata) || metadata.issuer || null;
}

function uniqueParts(parts: Array<string | null | undefined>): string[] {
  return [...new Set(parts.filter((value): value is string => Boolean(value)))];
}

function getActorLabel(metadata: CommandTrustMetadata | null, scope: 'current' | 'origin'): string {
  if (!metadata) return scope === 'current' ? 'Unknown current source' : 'Unknown origin source';

  if (metadata.authMethod === 'JWT_AND_ED25519') {
    const combinedActors = uniqueParts([
      metadata.userId || metadata.issuer,
      getSignerLabel(metadata),
    ]);
    if (combinedActors.length > 0) {
      return combinedActors.join(' + ');
    }
  }

  if (hasJwtTrustInfo(metadata)) {
    return metadata.userId || metadata.issuer || getSignerLabel(metadata) || 'Unknown source';
  }

  return getSignerLabel(metadata) || metadata.issuer || metadata.userId || 'Unknown source';
}

function buildTrustBadges(
  metadata: CommandTrustMetadata | null,
  scope: 'current' | 'origin'
): ActivityTrustBadge[] {
  if (!metadata) return [];

  if (metadata.authMethod === 'JWT_AND_ED25519') {
    const jwtColor = metadata.trusted === false ? 'red' : 'green';
    const signatureColor = metadata.trusted === false ? 'red' : 'blue';

    return [
      {
        key: 'jwt-authorized',
        label: 'JWT authorised',
        color: jwtColor,
        actor: getJwtActorLabel(metadata) || getActorLabel(metadata, scope),
      },
      {
        key: 'signature-verified',
        label: 'Signature verified',
        color: signatureColor,
        actor: getEd25519ActorLabel(metadata) || getActorLabel(metadata, scope),
      },
    ];
  }

  return [
    {
      key: 'primary-trust',
      label: getTrustLabel(metadata),
      color: getTrustColor(metadata),
      actor: getActorLabel(metadata, scope),
    },
  ];
}

function getUpdateDetail(metadata: CommandTrustMetadata | null): string | undefined {
  if (!metadata) return undefined;

  const parts = uniqueParts([
    metadata.authMethod ? `Auth ${AUTH_METHOD_LABELS[metadata.authMethod] || metadata.authMethod}` : null,
    metadata.authMethod === 'JWT_AND_ED25519' && metadata.userId ? `JWT user ${metadata.userId}` : null,
    hasJwtTrustInfo(metadata) && metadata.issuer ? `Issuer ${metadata.issuer}` : null,
    hasEd25519TrustInfo(metadata) && metadata.signerOwner ? `Signer ${metadata.signerOwner}` : null,
    hasEd25519TrustInfo(metadata) && metadata.signerAlgorithm ? `Alg ${metadata.signerAlgorithm}` : null,
    hasEd25519TrustInfo(metadata) && metadata.signerKeyId ? `Key ${metadata.signerKeyId}` : null,
  ]);

  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function getTrustStateSummary(
  metadataEntries: CommandTrustMetadata[]
): 'trusted' | 'untrusted' | 'mixed' | null {
  const trustStates = metadataEntries
    .map(entry => entry.trusted)
    .filter((value): value is boolean => typeof value === 'boolean');

  if (trustStates.length === 0) return null;
  if (trustStates.every(Boolean)) return 'trusted';
  if (trustStates.every(value => !value)) return 'untrusted';
  return 'mixed';
}

function buildTrustSnapshot(
  metadata: CommandTrustMetadata | null,
  scope: 'current' | 'origin'
): ActivityTrustSnapshot {
  const trustLabel = metadata
    ? getTrustLabel(metadata)
    : scope === 'current'
      ? 'No current trust metadata'
      : 'No origin trust metadata';

  return {
    scope,
    scopeLabel: scope === 'current' ? 'Current command' : 'Origin command',
    actor: getActorLabel(metadata, scope),
    trustLabel,
    trustColor: metadata ? getTrustColor(metadata) : 'default',
    trustBadges: buildTrustBadges(metadata, scope),
    detail: getUpdateDetail(metadata),
  };
}

function collectMetadataEntries(
  history: TimedFlowNodeUpdate[],
  scope: 'current' | 'origin'
): CommandTrustMetadata[] {
  return history
    .map(update => getTrustMetadata(update)[scope])
    .filter((value): value is CommandTrustMetadata => Boolean(value));
}

function hasDistinctOriginMetadata(history: TimedFlowNodeUpdate[]): boolean {
  return history.some(update => {
    const metadata = getTrustMetadata(update);
    return Boolean(metadata.origin) && !areTrustMetadataEquivalent(metadata.current, metadata.origin);
  });
}

export function buildSelectedFlowNodeActivityRows({
  selectedFlowNodeInstance,
}: BuildSelectedFlowNodeActivityRowsOptions): ActivityRow[] {
  return normalizeHistory(selectedFlowNodeInstance).map((update, index) => {
    const metadata = getTrustMetadata(update);
    const timestampMs = new Date(update.timestamp).getTime();
    const stateName = getStateName(update);
    return {
      key: `selected-update-${timestampMs}-${index}`,
      timestampMs,
      timeLabel: formatTimestampWithMs(update.timestamp),
      activity: stateName,
      current: buildTrustSnapshot(metadata.current, 'current'),
      origin:
        metadata.origin && !areTrustMetadataEquivalent(metadata.current, metadata.origin)
          ? buildTrustSnapshot(metadata.origin, 'origin')
          : null,
    };
  });
}

export function buildSelectedFlowNodeTrustFacts({
  selectedFlowNodeInstance,
}: BuildSelectedFlowNodeTrustFactsOptions): TrustFact[] {
  const history = normalizeHistory(selectedFlowNodeInstance);
  if (history.length === 0) return [];

  const facts: TrustFact[] = [
    { key: 'updates', label: `${history.length} update${history.length === 1 ? '' : 's'} combined` },
  ];

  const currentEntries = collectMetadataEntries(history, 'current');
  const distinctOriginExists = hasDistinctOriginMetadata(history);
  const originEntries = distinctOriginExists ? collectMetadataEntries(history, 'origin') : [];

  if (currentEntries.length === 0 && originEntries.length === 0) {
    facts.push({ key: 'trust', label: 'No trust metadata on this flow node history' });
    return facts;
  }

  if (currentEntries.length > 0) {
    const latestCurrent = currentEntries.at(-1)!;
    facts.push({
      key: 'current-latest',
      label: `Current ${getTrustLabel(latestCurrent)}`,
      color: getTrustColor(latestCurrent),
      detail: getUpdateDetail(latestCurrent),
    });

    const currentState = getTrustStateSummary(currentEntries);
    if (currentState === 'mixed') {
      facts.push({ key: 'current-attention', label: 'Current trust mixed', color: 'orange' });
    } else if (currentState === 'untrusted') {
      facts.push({ key: 'current-attention', label: 'Current updates untrusted', color: 'red' });
    }
  }

  if (originEntries.length > 0) {
    const latestOrigin = originEntries.at(-1)!;
    facts.push({
      key: 'origin-latest',
      label: `Origin ${getTrustLabel(latestOrigin)}`,
      color: getTrustColor(latestOrigin),
      detail: getUpdateDetail(latestOrigin),
    });

    const originState = getTrustStateSummary(originEntries);
    if (originState === 'mixed') {
      facts.push({ key: 'origin-attention', label: 'Origin trust mixed', color: 'orange' });
    } else if (originState === 'untrusted') {
      facts.push({ key: 'origin-attention', label: 'Origin updates untrusted', color: 'red' });
    }
  }

  return facts;
}
