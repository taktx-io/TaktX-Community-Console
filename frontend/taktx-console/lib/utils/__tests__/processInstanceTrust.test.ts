import {
  buildSelectedFlowNodeActivityRows,
  buildSelectedFlowNodeTrustFacts,
} from '@/lib/utils/processInstanceTrust';
import type { TimedFlowNodeInstance } from '@/lib/api/processInstanceApi';

describe('processInstanceTrust', () => {
  const selectedFlowNodeInstance: TimedFlowNodeInstance = {
    timestamp: '2026-03-18T13:56:03.564Z',
    elementId: 'confirm_shipment',
    elementName: 'Confirm shipment & notify customer',
    elementType: 'serviceTask',
    flowNodeInstanceUpdate: {
      flowNodeInstance: {
        elementInstanceId: 9,
        parentElementInstanceId: 5,
        elementIndex: 6,
        elementId: 'confirm_shipment',
        state: 'COMPLETED',
        passedCnt: 3,
      },
      currentTrustMetadata: {
        authMethod: 'ED25519',
        verificationResult: 'SIGNATURE_VERIFIED',
        trusted: true,
        userId: 'warehouse@taktx.local',
        issuer: 'taktx-engine',
        signerKeyId: 'engine-key-1',
        signerOwner: 'engine-a',
        signerAlgorithm: 'Ed25519',
      },
      originTrustMetadata: {
        authMethod: 'JWT',
        verificationResult: 'JWT_AUTHORIZED',
        trusted: true,
        userId: 'admin@taktx.local',
        issuer: 'taktx-platform-service',
      },
    },
    updateHistory: [
      {
        timestamp: '2026-03-18T13:56:03.345Z',
        flowNodeInstanceUpdate: {
          flowNodeInstance: {
            elementInstanceId: 9,
            parentElementInstanceId: 5,
            elementIndex: 6,
            elementId: 'confirm_shipment',
            state: 'ACTIVE',
            passedCnt: 1,
          },
          currentTrustMetadata: {
            authMethod: 'JWT',
            verificationResult: 'JWT_AUTHORIZED',
            trusted: true,
            userId: 'admin@taktx.local',
            issuer: 'taktx-platform-service',
          },
          originTrustMetadata: {
            authMethod: 'JWT',
            verificationResult: 'JWT_AUTHORIZED',
            trusted: true,
            userId: 'admin@taktx.local',
            issuer: 'taktx-platform-service',
          },
        },
      },
      {
        timestamp: '2026-03-18T13:56:03.564Z',
        flowNodeInstanceUpdate: {
          flowNodeInstance: {
            elementInstanceId: 9,
            parentElementInstanceId: 5,
            elementIndex: 6,
            elementId: 'confirm_shipment',
            state: 'COMPLETED',
            passedCnt: 3,
          },
          currentTrustMetadata: {
            authMethod: 'ED25519',
            verificationResult: 'SIGNATURE_VERIFIED',
            trusted: true,
            userId: 'warehouse@taktx.local',
            issuer: 'taktx-engine',
            signerKeyId: 'engine-key-1',
            signerOwner: 'engine-a',
            signerAlgorithm: 'Ed25519',
          },
          originTrustMetadata: {
            authMethod: 'JWT',
            verificationResult: 'JWT_AUTHORIZED',
            trusted: true,
            userId: 'admin@taktx.local',
            issuer: 'taktx-platform-service',
          },
        },
      },
    ],
  };

  it('builds activity rows from the selected flow-node update history in chronological order', () => {
    const rows = buildSelectedFlowNodeActivityRows({
      selectedFlowNodeInstance,
    });

    expect(rows.map(row => row.activity)).toEqual(['ACTIVE', 'COMPLETED']);
    expect(rows[0].current.trustLabel).toBe('JWT authorised');
    expect(rows[0].origin).toBeNull();
    expect(rows[1].current.trustLabel).toBe('Signature verified');
    expect(rows[1].current.actor).toBe('warehouse@taktx.local');
    expect(rows[1].origin).toMatchObject({
      trustLabel: 'JWT authorised',
      actor: 'admin@taktx.local',
      scope: 'origin',
    });
  });

  it('shows missing current trust metadata while still surfacing origin provenance', () => {
    const rows = buildSelectedFlowNodeActivityRows({
      selectedFlowNodeInstance: {
        ...selectedFlowNodeInstance,
        updateHistory: [
          {
            timestamp: '2026-03-18T13:56:03.345Z',
            flowNodeInstanceUpdate: {
              flowNodeInstance: {
                elementInstanceId: 9,
                parentElementInstanceId: 5,
                elementIndex: 6,
                elementId: 'confirm_shipment',
                state: 'ACTIVE',
                passedCnt: 1,
              },
              originTrustMetadata: {
                authMethod: 'JWT',
                verificationResult: 'JWT_AUTHORIZED',
                trusted: true,
                userId: 'admin@taktx.local',
                issuer: 'taktx-platform-service',
              },
            },
          },
        ],
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].current.trustLabel).toBe('No current trust metadata');
    expect(rows[0].current.actor).toBe('Unknown current source');
    expect(rows[0].origin).toMatchObject({
      trustLabel: 'JWT authorised',
      actor: 'admin@taktx.local',
    });
  });

  it('builds compact trust summary facts for current and origin metadata', () => {
    const facts = buildSelectedFlowNodeTrustFacts({
      selectedFlowNodeInstance,
    });

    expect(facts).toEqual([
      { key: 'updates', label: '2 updates combined' },
      {
        key: 'current-latest',
        label: 'Current Signature verified',
        color: 'blue',
        detail: 'Auth Ed25519 · Issuer taktx-engine · Signer engine-a · Alg Ed25519 · Key engine-key-1',
      },
      {
        key: 'origin-latest',
        label: 'Origin JWT authorised',
        color: 'green',
        detail: 'Auth JWT · Issuer taktx-platform-service',
      },
    ]);
  });

  it('shows both JWT and Ed25519 signing info when both verifications succeeded', () => {
    const dualTrustInstance: TimedFlowNodeInstance = {
      ...selectedFlowNodeInstance,
      updateHistory: [
        {
          timestamp: '2026-03-18T13:56:03.564Z',
          flowNodeInstanceUpdate: {
            flowNodeInstance: {
              elementInstanceId: 9,
              parentElementInstanceId: 5,
              elementIndex: 6,
              elementId: 'confirm_shipment',
              state: 'COMPLETED',
              passedCnt: 3,
            },
            currentTrustMetadata: {
              authMethod: 'JWT_AND_ED25519',
              trusted: true,
              userId: 'admin@taktx.local',
              issuer: 'taktx-platform-service',
              signerKeyId: 'engine-key-1',
              signerOwner: 'engine-a',
              signerAlgorithm: 'Ed25519',
            },
          },
        },
      ],
    };

    const rows = buildSelectedFlowNodeActivityRows({
      selectedFlowNodeInstance: dualTrustInstance,
    });
    const facts = buildSelectedFlowNodeTrustFacts({
      selectedFlowNodeInstance: dualTrustInstance,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].current.actor).toBe('admin@taktx.local + engine-a');
    expect(rows[0].current.trustBadges).toEqual([
      { key: 'jwt-authorized', label: 'JWT authorised', color: 'green', actor: 'admin@taktx.local' },
      { key: 'signature-verified', label: 'Signature verified', color: 'blue', actor: 'engine-a' },
    ]);
    expect(rows[0].current.detail).toBe(
      'Auth JWT + Ed25519 · JWT user admin@taktx.local · Issuer taktx-platform-service · Signer engine-a · Alg Ed25519 · Key engine-key-1'
    );

    expect(facts).toEqual([
      { key: 'updates', label: '1 update combined' },
      {
        key: 'current-latest',
        label: 'Current Trusted',
        color: 'green',
        detail: 'Auth JWT + Ed25519 · JWT user admin@taktx.local · Issuer taktx-platform-service · Signer engine-a · Alg Ed25519 · Key engine-key-1',
      },
    ]);
  });

  it('surfaces an attention fact when current trust is mixed across updates', () => {
    const facts = buildSelectedFlowNodeTrustFacts({
      selectedFlowNodeInstance: {
        ...selectedFlowNodeInstance,
        updateHistory: [
          {
            timestamp: '2026-03-18T13:56:03.345Z',
            flowNodeInstanceUpdate: {
              flowNodeInstance: {
                elementInstanceId: 9,
                parentElementInstanceId: 5,
                elementIndex: 6,
                elementId: 'confirm_shipment',
                state: 'ACTIVE',
                passedCnt: 1,
              },
              currentTrustMetadata: {
                verificationResult: 'JWT_AUTHORIZED',
                trusted: true,
                userId: 'admin@taktx.local',
              },
            },
          },
          {
            timestamp: '2026-03-18T13:56:03.564Z',
            flowNodeInstanceUpdate: {
              flowNodeInstance: {
                elementInstanceId: 9,
                parentElementInstanceId: 5,
                elementIndex: 6,
                elementId: 'confirm_shipment',
                state: 'COMPLETED',
                passedCnt: 3,
              },
              currentTrustMetadata: {
                verificationResult: 'SIGNATURE_VERIFIED',
                trusted: false,
                userId: 'warehouse@taktx.local',
              },
            },
          },
        ],
      },
    });

    expect(facts).toEqual([
      { key: 'updates', label: '2 updates combined' },
      {
        key: 'current-latest',
        label: 'Current Signature verified',
        color: 'red',
        detail: undefined,
      },
      {
        key: 'current-attention',
        label: 'Current trust mixed',
        color: 'orange',
      },
    ]);
  });

  it('continues to support legacy commandTrustMetadata payloads as current trust', () => {
    const rows = buildSelectedFlowNodeActivityRows({
      selectedFlowNodeInstance: {
        ...selectedFlowNodeInstance,
        updateHistory: [
          {
            timestamp: '2026-03-18T13:56:03.345Z',
            flowNodeInstanceUpdate: {
              flowNodeInstance: {
                elementInstanceId: 9,
                parentElementInstanceId: 5,
                elementIndex: 6,
                elementId: 'confirm_shipment',
                state: 'ACTIVE',
                passedCnt: 1,
              },
              commandTrustMetadata: {
                authMethod: 'JWT',
                verificationResult: 'JWT_AUTHORIZED',
                trusted: true,
                userId: 'legacy@taktx.local',
              },
            },
          },
        ],
      },
    });

    expect(rows[0].current).toMatchObject({
      trustLabel: 'JWT authorised',
      actor: 'legacy@taktx.local',
      scope: 'current',
    });
    expect(rows[0].origin).toBeNull();
  });
});


