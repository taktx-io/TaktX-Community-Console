'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Modal, Select, Input, Button, Alert, Space, App, Spin, Divider, Tooltip } from 'antd';
import {
  PlayCircleOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  DeleteOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import type { ProcessDefinitionVersionInfo } from '@/lib/api/runwayApi';
import { batchExists } from '@/lib/utils/batchStorage';

const { TextArea } = Input;

interface StartProcessModalProps {
  open: boolean;
  onClose: () => void;
  processDefinitionIds: string[];
  versions: ProcessDefinitionVersionInfo[];
  /** Pre-filled process definition ID */
  prefillDefinitionId?: string | null;
  /** Pre-filled version (null means "Latest") */
  prefillVersion?: number | null;
  /** Callback when instances are successfully started */
  onStartSuccess: (instanceIds: string[], bookmarkName: string | null, processDefinitionId: string, version: number | null) => void;
}

interface VariableRow {
  key: string;
  value: string; // JSON string (can be primitive or array)
}

/**
 * StartProcessModal - Modal for starting process instances with support for:
 * - Variable definitions that can be used in JSON with {{varName}} syntax
 * - Built-in tokens: {{index}}, {{index1}}, {{timestamp}}, {{uuid}}
 * - JSON editor with line numbers
 * - Validation for undefined variables
 * - Array-based batch creation
 * - Batch naming and persistence
 */
export default function StartProcessModal({
  open,
  onClose,
  processDefinitionIds,
  versions: propVersions,
  prefillDefinitionId,
  prefillVersion,
  onStartSuccess,
}: StartProcessModalProps) {
  const { message, modal } = App.useApp();

  const [selectedDefinitionId, setSelectedDefinitionId] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [bookmarkName, setBookmarkName] = useState<string>('');

  // Modal's own versions state (fetched when definition selected)
  const [versions, setVersions] = useState<ProcessDefinitionVersionInfo[]>(propVersions);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Variable definitions (can be used in JSON with {{varName}})
  const [variables, setVariables] = useState<VariableRow[]>([]);

  // Manual batch count (only editable when no variables defined)
  const [manualBatchCount, setManualBatchCount] = useState<number>(1);

  // Expanded variable editor (modal within modal for better editing)
  const [expandedVariable, setExpandedVariable] = useState<{ index: number; value: string } | null>(null);

  // Preview modal state
  const [showPreview, setShowPreview] = useState(false);

  // Help modal state
  const [showHelp, setShowHelp] = useState(false);

  // JSON editor content
  const [jsonText, setJsonText] = useState<string>('{\n  "orderId": "{{uuid}}",\n  "index": "{{index1}}"\n}');

  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Prefill from props when modal opens
  useEffect(() => {
    if (open) {
      console.log('[StartProcessModal] Modal opening', {
        prefillDefinitionId,
        prefillVersion,
        propVersionsLength: propVersions.length
      });
      setSelectedDefinitionId(prefillDefinitionId || null);
      setSelectedVersion(prefillVersion !== undefined ? prefillVersion : null);
      setBookmarkName('');
      setShowSuccess(false);
      // Only use prop versions initially if they exist and match the prefilled definition
      // Otherwise, the fetch effect will load them
      if (propVersions.length > 0) {
        setVersions(propVersions);
      }
    }
  }, [open, prefillDefinitionId, prefillVersion, propVersions]);

  // Fetch versions when definition changes
  useEffect(() => {
    if (!selectedDefinitionId) {
      console.log('[StartProcessModal] No definition selected, clearing versions');
      setVersions([]);
      setSelectedVersion(null);
      return;
    }

    console.log('[StartProcessModal] Fetching versions for:', selectedDefinitionId);

    // Fetch versions for this definition
    const fetchVersions = async () => {
      setLoadingVersions(true);
      try {
        const { getProcessDefinitionVersions } = await import('@/lib/api/runwayApi');
        const fetchedVersions = await getProcessDefinitionVersions(selectedDefinitionId);
        console.log('[StartProcessModal] Fetched versions:', fetchedVersions);
        setVersions(fetchedVersions);
      } catch (error) {
        console.error('[StartProcessModal] Failed to fetch versions:', error);
        message.error('Failed to load versions');
        setVersions([]);
      } finally {
        setLoadingVersions(false);
      }
    };

    fetchVersions();
  }, [selectedDefinitionId, message]);

  // Helper to detect type of a value
  const getValueType = (val: any): string => {
    if (val === null) return 'null';
    if (Array.isArray(val)) return 'array';
    return typeof val;
  };

  // Validate variable definitions
  const variableValidation = useMemo(() => {
    const errors: { index: number; message: string }[] = [];
    const reservedNames = ['index', 'index1', 'timestamp', 'uuid'];

    variables.forEach((v, index) => {
      const key = v.key.trim();
      const value = v.value.trim();

      // Check for reserved variable names
      if (key && reservedNames.includes(key.toLowerCase())) {
        errors.push({ index, message: `"${key}" is a reserved variable name. Reserved: ${reservedNames.join(', ')}` });
      }
      // Check variable name (only alphanumeric and underscore)
      else if (key && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
        errors.push({ index, message: `Invalid variable name: "${key}". Use only letters, numbers, and underscores.` });
      }

      // Check if value is valid JSON array
      if (value) {
        try {
          const parsed = JSON.parse(value);
          if (!Array.isArray(parsed)) {
            errors.push({ index, message: 'Value must be a JSON array (e.g., [1, 2, 3])' });
          } else if (parsed.length > 0) {
            // Check that all elements have the same type
            const firstType = getValueType(parsed[0]);
            const allSameType = parsed.every(el => getValueType(el) === firstType);

            if (!allSameType) {
              const types = [...new Set(parsed.map(el => getValueType(el)))].join(', ');
              errors.push({
                index,
                message: `All array elements must be the same type. Found: ${types}`
              });
            }
          }
        } catch {
          errors.push({ index, message: 'Invalid JSON array' });
        }
      }

      // Check for empty key with value
      if (!key && value) {
        errors.push({ index, message: 'Variable name is required' });
      }
    });

    return errors;
  }, [variables]);


  // Build map of available variables (user-defined + built-in)
  const availableVariables = useMemo(() => {
    const vars = new Set<string>();

    // Built-in tokens
    vars.add('index');
    vars.add('index1');
    vars.add('timestamp');
    vars.add('uuid');

    // User-defined variables (only if valid)
    variables.forEach((v, index) => {
      const key = v.key.trim();
      if (key && !variableValidation.some(e => e.index === index)) {
        vars.add(key);
      }
    });

    return vars;
  }, [variables, variableValidation]);

  // Find all variables used in JSON text
  const usedVariables = useMemo(() => {
    const matches = jsonText.matchAll(/\{\{(\w+)\}\}/g);
    const used = new Set<string>();
    for (const match of matches) {
      used.add(match[1]);
    }
    return used;
  }, [jsonText]);

  // Find undefined variables (used but not defined)
  const undefinedVariables = useMemo(() => {
    const undefined: string[] = [];
    usedVariables.forEach(varName => {
      if (!availableVariables.has(varName)) {
        undefined.push(varName);
      }
    });
    return undefined;
  }, [usedVariables, availableVariables]);

  // Check if we have valid variables defined
  const hasValidVariables = useMemo(() => {
    return variables.some(v => {
      const key = v.key.trim();
      const value = v.value.trim();
      if (!key || !value) return false;

      // Must be valid variable name
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) return false;

      // Must be valid JSON array
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed);
      } catch {
        return false;
      }
    });
  }, [variables]);

  // Parse and validate JSON
  const jsonValidation = useMemo(() => {
    try {
      const parsed = JSON.parse(jsonText);
      const isArray = Array.isArray(parsed);

      // If JSON is an array, validate that all first-level elements are objects
      if (isArray) {
        const allObjects = parsed.every(el => el !== null && typeof el === 'object' && !Array.isArray(el));
        if (!allObjects) {
          return {
            valid: false,
            parsed: null,
            isArray: true,
            count: 0,
            arrayVars: [],
            hasMismatch: false,
            error: 'When using a JSON array, all elements must be objects. Arrays, strings, numbers, and other primitives are not allowed at the first level.'
          };
        }
      }

      // Calculate count based on:
      // 1. If JSON is array: array length (leading - determines batch count)
      // 2. If variables defined: max variable array length
      // 3. Otherwise: manual batch count
      let count = isArray ? parsed.length : 1;

      // Check if any user-defined variables are arrays - use max length
      const arrayVars: { key: string; length: number }[] = [];
      for (const row of variables) {
        if (!row.key.trim() || !row.value.trim()) continue;
        try {
          const varParsed = JSON.parse(row.value);
          if (Array.isArray(varParsed)) {
            arrayVars.push({ key: row.key, length: varParsed.length });
            // If JSON is not an array, variables determine count
            if (!isArray) {
              count = Math.max(count, varParsed.length);
            }
          }
        } catch {
          // Not valid JSON or not an array
        }
      }

      // If no arrays in JSON or variables, use manual count
      if (!isArray && arrayVars.length === 0) {
        count = manualBatchCount;
      }

      const hasMismatch = arrayVars.length > 1 && arrayVars.some(v => v.length !== count);

      return { valid: true, parsed, isArray, count, arrayVars, hasMismatch };
    } catch (error) {
      return { valid: false, parsed: null, isArray: false, count: 0, arrayVars: [], hasMismatch: false, error: String(error) };
    }
  }, [jsonText, variables, manualBatchCount]);

  // Final batch count
  const batchCount = jsonValidation.count;

  // Determine warning level based on count
  const warningLevel = useMemo(() => {
    if (batchCount <= 10) return 'ok';
    if (batchCount <= 25) return 'caution';
    if (batchCount <= 50) return 'warning';
    return 'blocked';
  }, [batchCount]);

  // Validation: can submit?
  const canSubmit = useMemo(() => {
    if (!selectedDefinitionId) return false;
    if (loading) return false;
    if (warningLevel === 'blocked') return false;
    if (!jsonValidation.valid) return false;
    if (undefinedVariables.length > 0) return false; // Block if using undefined variables
    if (variableValidation.length > 0) return false; // Block if variable definitions are invalid

    // Bookmark name is optional - will be auto-generated if not provided

    return true;
  }, [selectedDefinitionId, loading, warningLevel, jsonValidation.valid, undefinedVariables, variableValidation]);

  // Generate preview of what will be sent to backend
  const generatePreview = (): Record<string, any>[] => {
    if (!jsonValidation.valid) return [];

    try {
      const buildVariableMap = (index: number): Record<string, any> => {
        const varMap: Record<string, any> = {
          index,
          index1: index + 1,
          timestamp: new Date().toISOString(),
          uuid: crypto.randomUUID(),
        };

        for (const row of variables) {
          if (!row.key.trim()) continue;
          try {
            const parsed = JSON.parse(row.value);
            if (Array.isArray(parsed)) {
              varMap[row.key] = index < parsed.length ? parsed[index] : null;
            } else {
              varMap[row.key] = parsed;
            }
          } catch {
            varMap[row.key] = row.value;
          }
        }
        return varMap;
      };

      const previewArray: Record<string, any>[] = [];
      const previewCount = Math.min(batchCount, 5); // Preview max 5 instances

      if (jsonValidation.isArray) {
        for (let i = 0; i < previewCount; i++) {
          const varMap = buildVariableMap(i);
          const replaced = applyVariableReplacements(jsonValidation.parsed[i], varMap);
          previewArray.push(replaced);
        }
      } else {
        for (let i = 0; i < previewCount; i++) {
          const varMap = buildVariableMap(i);
          const replaced = applyVariableReplacements(jsonValidation.parsed, varMap);
          previewArray.push(replaced);
        }
      }

      return previewArray;
    } catch (error) {
      console.error('Preview generation error:', error);
      return [];
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit || !selectedDefinitionId) return;

    // Check if bookmark exists and confirm overwrite
    if (bookmarkName.trim() && batchExists(bookmarkName.trim())) {
      const confirmed = await new Promise<boolean>(resolve => {
        modal.confirm({
          title: 'Bookmark already exists',
          content: `A bookmark named "${bookmarkName.trim()}" already exists. Do you want to overwrite it?`,
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });

      if (!confirmed) return;
    }

    setLoading(true);

    try {
      // Build variable map for each iteration (user-defined variables)
      const buildVariableMap = (index: number): Record<string, any> => {
        const varMap: Record<string, any> = {
          index,
          index1: index + 1,
          timestamp: new Date().toISOString(),
          uuid: crypto.randomUUID(),
        };

        // Add user-defined variables
        for (const row of variables) {
          if (!row.key.trim()) continue;

          try {
            const parsed = JSON.parse(row.value);
            if (Array.isArray(parsed)) {
              // Array: index into it (or null if out of bounds)
              varMap[row.key] = index < parsed.length ? parsed[index] : null;
            } else {
              // Primitive: use as-is
              varMap[row.key] = parsed;
            }
          } catch {
            // Treat as string literal
            varMap[row.key] = row.value;
          }
        }

        return varMap;
      };

      // Build array of variable objects to start
      const variablesArray: Record<string, any>[] = [];

      if (jsonValidation.isArray) {
        // Array mode: each element is one instance, apply variable replacements to each
        for (let i = 0; i < jsonValidation.parsed.length; i++) {
          const varMap = buildVariableMap(i);
          const replaced = applyVariableReplacements(jsonValidation.parsed[i], varMap);
          variablesArray.push(replaced);
        }
      } else {
        // Object mode: repeat same object with variable replacements for each iteration
        for (let i = 0; i < batchCount; i++) {
          const varMap = buildVariableMap(i);
          const replaced = applyVariableReplacements(jsonValidation.parsed, varMap);
          variablesArray.push(replaced);
        }
      }

      // Import the API functions
      const { startProcessInstanceVersion } = await import('@/lib/api/runwayApi');

      // Send all instances in one request to backend (backend handles iteration)
      let allInstanceIds: string[];

      try {
        // Always use versioned endpoint; use -1 for latest version
        // Handle both null and undefined (undefined comes from allowClear)
        const versionToUse = selectedVersion == null ? -1 : selectedVersion;
        allInstanceIds = await startProcessInstanceVersion(
          selectedDefinitionId,
          versionToUse,
          variablesArray
        );
      } catch (error) {
        console.error('Failed to start instances:', error);
        message.error(`Failed to start instances: ${error}`);
        setLoading(false);
        return;
      }

      if (allInstanceIds.length === 0) {
        message.error('Failed to start any instances');
        setLoading(false);
        return;
      }

      // Show success state briefly
      setShowSuccess(true);
      await new Promise(resolve => setTimeout(resolve, 200));

      // Only use bookmark name if user explicitly provided one
      const finalBookmarkName = bookmarkName.trim() || null;

      // Notify parent with definition and version info
      onStartSuccess(allInstanceIds, finalBookmarkName, selectedDefinitionId, selectedVersion);

      // Close modal
      onClose();

    } catch (error) {
      console.error('Error starting process instances:', error);
      message.error(`Failed to start instances: ${error}`);
    } finally {
      setLoading(false);
      setShowSuccess(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={loading ? undefined : onClose}
      title="Start Process Instances"
      width={820}
      footer={null}
      maskClosable={!loading}
      closable={!loading}
      styles={{
        body: {
          maxHeight: '70vh',
          overflowY: 'auto',
          paddingTop: 16,
          paddingRight: 24,
        }
      }}
    >
      {(loading || showSuccess) && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          {showSuccess ? (
            <CheckCircleOutlined style={{ fontSize: 64, color: '#52c41a' }} />
          ) : (
            <Spin size="large" />
          )}
        </div>
      )}

      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        {/* Two-column grid for Process Definition and Version */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* Process Definition */}
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
              Process Definition *
            </label>
            <Select
              data-testid="start-process-definition-select"
              style={{ width: '100%' }}
              placeholder="Select process definition"
              value={selectedDefinitionId}
              onChange={setSelectedDefinitionId}
              options={processDefinitionIds.map(id => ({ label: id, value: id }))}
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </div>

          {/* Version */}
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
              Version
            </label>
            <Select
              data-testid="start-process-version-select"
              style={{ width: '100%' }}
              placeholder="Latest"
              value={selectedVersion}
              onChange={setSelectedVersion}
              loading={loadingVersions}
              disabled={!selectedDefinitionId}
              allowClear
              options={versions.map(v => ({
                label: `v${v.version}`,
                value: v.version,
                versionTag: v.versionTag,
              }))}
            labelRender={(props) => {
              const versionInfo = versions.find(v => v.version === props.value);
              const versionTag = versionInfo?.versionTag;

              return (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', maxWidth: '100%', overflow: 'hidden' }}>
                  <span style={{ flexShrink: 0 }}>v{props.value}</span>
                  {versionTag && (
                    <span
                      title={versionTag}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '1px 6px',
                        fontSize: '11px',
                        fontWeight: 500,
                        color: '#1890ff',
                        background: '#e6f7ff',
                        border: '1px solid #91d5ff',
                        borderRadius: '8px',
                        lineHeight: '1.2',
                        maxWidth: '160px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flexShrink: 1,
                      }}>
                      {versionTag}
                    </span>
                  )}
                </span>
              );
            }}
            optionRender={(option) => {
              const versionTag = (option.data as any)?.versionTag;
              return (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', maxWidth: '100%', overflow: 'hidden' }}>
                  <span style={{ flexShrink: 0 }}>v{option.value}</span>
                  {versionTag && (
                    <span
                      title={versionTag}
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        fontSize: '11px',
                        fontWeight: 500,
                        color: '#1890ff',
                        background: '#e6f7ff',
                        border: '1px solid #91d5ff',
                        borderRadius: '10px',
                        maxWidth: '220px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flexShrink: 1,
                      }}>
                      {versionTag}
                    </span>
                  )}
                </span>
              );
            }}
          />
        </div>
      </div>

        {/* Two-column grid for Bookmark and Batch Count */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: '16px' }}>
          {/* Bookmark */}
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
              Bookmark <span style={{ fontWeight: 400, color: '#888' }}>
                {batchCount > 1 ? '(optional - auto-generated if empty)' : '(optional)'}
              </span>
            </label>
            <Input
              data-testid="start-process-bookmark-input"
              placeholder={batchCount > 1 ? "Auto-generated: timestamp_count_instances" : "Optional - bookmark to save"}
              value={bookmarkName}
              onChange={e => setBookmarkName(e.target.value)}
              maxLength={64}
            />
          </div>

          {/* Batch Count */}
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
              Batch Count
            </label>
            <Input
              data-testid="start-process-batch-count"
              type="number"
              min={1}
              max={50}
              value={hasValidVariables || jsonValidation.isArray ? batchCount : manualBatchCount}
              onChange={e => setManualBatchCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
              disabled={hasValidVariables || jsonValidation.isArray}
              placeholder="Count"
              style={{ width: '100%' }}
            />
            {(hasValidVariables || jsonValidation.isArray) && (
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                {jsonValidation.isArray ? 'From array length' : 'From variable arrays'}
              </div>
            )}
          </div>
        </div>

        {/* Variable Definitions */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label style={{ fontWeight: 500 }}>
              Variable Definitions
            </label>
            <Button
              type="dashed"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => setVariables([...variables, { key: '', value: '[]' }])}
            >
              Add Variable
            </Button>
          </div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
            Define array variables that can be used in JSON with {'{{'} varName {'}}'} syntax. Each must be a JSON array.
          </div>
          {variables.length > 0 && (
            <Space direction="vertical" size="small" style={{ width: '100%', marginBottom: 8 }}>
              {variables.map((row, index) => {
                const error = variableValidation.find(e => e.index === index);
                return (
                  <div key={index}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <Input
                        placeholder="variableName"
                        value={row.key}
                        onChange={e => {
                          const updated = [...variables];
                          updated[index] = { ...updated[index], key: e.target.value };
                          setVariables(updated);
                        }}
                        status={error ? 'error' : undefined}
                        style={{ width: '30%' }}
                      />
                      <div style={{ flex: 1, position: 'relative' }}>
                        <Input
                          placeholder='[1, 2, 3] or ["a", "b"]'
                          value={row.value}
                          onChange={e => {
                            const updated = [...variables];
                            updated[index] = { ...updated[index], value: e.target.value };
                            setVariables(updated);
                          }}
                          status={error ? 'error' : undefined}
                          style={{ fontFamily: 'monospace', fontSize: 12, paddingRight: 80 }}
                        />
                        <Button
                          size="small"
                          type="link"
                          onClick={() => setExpandedVariable({ index, value: row.value })}
                          style={{ position: 'absolute', right: 8, top: 4 }}
                        >
                          Expand
                        </Button>
                      </div>
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => setVariables(variables.filter((_, i) => i !== index))}
                      />
                    </div>
                    {error && (
                      <div style={{ color: '#ff4d4f', fontSize: 12, marginTop: 4, marginLeft: 8 }}>
                        {error.message}
                      </div>
                    )}
                  </div>
                );
              })}
            </Space>
          )}
        </div>

        <Divider style={{ margin: '8px 0' }} />

        {/* JSON Editor with line numbers */}
        <div>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
            Variables JSON *
          </label>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>
              Built-in tokens: {'{{'} index {'}}'}  , {'{{'} index1 {'}}'}  , {'{{'} timestamp {'}}'}  , {'{{'} uuid {'}}'}
            </span>
            <Tooltip title="Learn more about tokens and variables">
              <Button
                type="text"
                size="small"
                icon={<InfoCircleOutlined style={{ fontSize: 14, color: '#1890ff' }} />}
                onClick={() => setShowHelp(true)}
                style={{ padding: 0, height: 'auto', minWidth: 'auto' }}
              />
            </Tooltip>
          </div>
          <div style={{ display: 'flex', border: '1px solid #d9d9d9', borderRadius: 4 }}>
            {/* Line numbers */}
            <div style={{
              padding: '4px 8px',
              background: '#fafafa',
              borderRight: '1px solid #d9d9d9',
              fontFamily: 'monospace',
              fontSize: 13,
              lineHeight: '22px',
              color: '#8c8c8c',
              userSelect: 'none',
              textAlign: 'right',
              minWidth: 40,
            }}>
              {jsonText.split('\n').map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            {/* JSON editor */}
            <TextArea
              ref={textareaRef}
              rows={10}
              value={jsonText}
              onChange={e => setJsonText(e.target.value)}
              placeholder='{"orderId": "{{uuid}}", "index": "{{index1}}"}'
              style={{
                fontFamily: 'monospace',
                fontSize: 13,
                lineHeight: '22px',
                border: 'none',
                outline: 'none',
                resize: 'none',
                flex: 1,
              }}
            />
          </div>

          {/* Validation errors */}
          {!jsonValidation.valid && (
            <Alert
              type="error"
              message="Invalid JSON"
              description={jsonValidation.error}
              style={{ marginTop: 8 }}
              showIcon
            />
          )}

          {undefinedVariables.length > 0 && (
            <Alert
              type="error"
              message="Undefined Variables"
              description={
                <div>
                  The following variables are used but not defined:
                  <div style={{ marginTop: 4 }}>
                    {undefinedVariables.map(v => (
                      <div key={v}>• {'{{'}{v}{'}}'}  </div>
                    ))}
                  </div>
                </div>
              }
              style={{ marginTop: 8 }}
              showIcon
            />
          )}
        </div>

        {/* Batch Count and Warnings */}
        <BatchWarning
          count={batchCount}
          level={warningLevel}
          isArray={jsonValidation.isArray}
          hasMismatch={jsonValidation.hasMismatch}
          mismatchVars={jsonValidation.arrayVars}
        />

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
          <Button
            data-testid="start-process-preview-button"
            onClick={() => setShowPreview(true)}
            disabled={!jsonValidation.valid || undefinedVariables.length > 0 || variableValidation.length > 0}
          >
            Preview
          </Button>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              data-testid="start-process-start-button"
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleSubmit}
              disabled={!canSubmit}
              loading={loading}
            >
              Start {batchCount === 1 ? 'Instance' : `${batchCount} Instances`}
            </Button>
          </div>
        </div>
      </Space>

      {/* Preview Modal */}
      {showPreview && (
        <Modal
          open={true}
          onCancel={() => setShowPreview(false)}
          title="Preview Result"
          width={700}
          footer={
            <Button type="primary" onClick={() => setShowPreview(false)}>
              Close
            </Button>
          }
        >
          <div>
            <div style={{ marginBottom: 12, fontSize: 13, color: '#888' }}>
              {batchCount > 5 ? (
                <>Showing first 5 of {batchCount} instances that will be created</>
              ) : (
                <>Preview of {batchCount} {batchCount === 1 ? 'instance' : 'instances'} that will be created</>
              )}
            </div>
            <div style={{
              maxHeight: '60vh',
              overflowY: 'auto',
              background: '#fafafa',
              border: '1px solid #d9d9d9',
              borderRadius: 4,
              padding: 12
            }}>
              <pre style={{
                margin: 0,
                fontFamily: 'monospace',
                fontSize: 13,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}>
                {JSON.stringify(generatePreview(), null, 2)}
              </pre>
            </div>
          </div>
        </Modal>
      )}

      {/* Help Modal */}
      {showHelp && (
        <Modal
          open={true}
          onCancel={() => setShowHelp(false)}
          title="Using Tokens and Variables"
          width={800}
          footer={
            <Button type="primary" onClick={() => setShowHelp(false)}>
              Got it
            </Button>
          }
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <h4 style={{ marginTop: 0 }}>Two Template Modes</h4>
              <p>You can use either a <strong>single object</strong> or an <strong>array of objects</strong> as your template:</p>
              <ul style={{ lineHeight: 1.8 }}>
                <li><strong>Single Object:</strong> Repeated for each instance with variable replacements</li>
                <li><strong>Array of Objects:</strong> The array length determines the batch count (leading). Variables are matched by index or set to null if out of bounds.</li>
              </ul>
              <div style={{ background: '#fff7e6', padding: 12, borderRadius: 4, border: '1px solid #ffd591', marginTop: 8 }}>
                <strong>⚠️ Important:</strong> When using an array template, only objects are allowed at the first level. Arrays, strings, numbers, and other primitives are not permitted.
              </div>
            </div>

            <div>
              <h4>Built-in Tokens</h4>
              <p>These tokens are automatically replaced with generated values for each instance:</p>
              <ul style={{ lineHeight: 1.8 }}>
                <li><code>{'{{'} index {'}}'}</code> - Zero-based iteration count (0, 1, 2, ...)</li>
                <li><code>{'{{'} index1 {'}}'}</code> - One-based iteration count (1, 2, 3, ...)</li>
                <li><code>{'{{'} timestamp {'}}'}</code> - Current ISO timestamp (unique per instance)</li>
                <li><code>{'{{'} uuid {'}}'}</code> - Random UUID (unique per instance)</li>
              </ul>
            </div>

            <div>
              <h4>Custom Variables</h4>
              <p>Define your own array variables in the "Variable Definitions" section above. Each variable must be a JSON array.</p>
              <p><strong>Example:</strong></p>
              <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, fontFamily: 'monospace', fontSize: 12 }}>
                Variable: <strong>orderIds</strong> = [101, 102, 103]<br/>
                Variable: <strong>names</strong> = ["Alice", "Bob", "Charlie"]
              </div>
            </div>

            <div>
              <h4>Using Tokens and Variables in JSON</h4>
              <p><strong>Important:</strong> Always place variables in quotes in your JSON template. The system will automatically convert them to the correct type based on the array element type when generating the final output.</p>

              <p style={{ marginTop: 16 }}><strong>Example with Numbers:</strong></p>
              <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, fontFamily: 'monospace', fontSize: 12, marginBottom: 8 }}>
                Variable: <strong>orderIds</strong> = [101, 102, 103]
              </div>
              <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, fontFamily: 'monospace', fontSize: 12, marginBottom: 12 }}>
                {`{\n  "orderId": "{{orderIds}}",\n  "count": "{{index1}}"\n}`}
              </div>
              <p style={{ fontSize: 12, color: '#52c41a' }}>✓ Output: {`{"orderId": 101, "count": 1}`} (converted to numbers)</p>

              <p style={{ marginTop: 16 }}><strong>Example with Strings:</strong></p>
              <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, fontFamily: 'monospace', fontSize: 12, marginBottom: 8 }}>
                Variable: <strong>names</strong> = ["Alice", "Bob", "Charlie"]
              </div>
              <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, fontFamily: 'monospace', fontSize: 12, marginBottom: 12 }}>
                {`{\n  "id": "{{uuid}}",\n  "customerName": "{{names}}"\n}`}
              </div>
              <p style={{ fontSize: 12, color: '#52c41a' }}>✓ Output: {`{"id": "a1b2c3...", "customerName": "Alice"}`} (stays as strings)</p>

              <p style={{ marginTop: 16 }}><strong>Mixed with Text:</strong></p>
              <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, fontFamily: 'monospace', fontSize: 12, marginBottom: 12 }}>
                {`{\n  "message": "Order {{orderIds}} for {{names}}"\n}`}
              </div>
              <p style={{ fontSize: 12, color: '#52c41a' }}>✓ Output: {`{"message": "Order 101 for Alice"}`} (converted to string)</p>
            </div>

            <div>
              <h4>Batch Processing Rules</h4>
              <p><strong>Single Object Template:</strong></p>
              <ul style={{ lineHeight: 1.8 }}>
                <li>Batch count determined by longest variable array</li>
                <li>If <strong>orderIds</strong> has 3 elements → Creates 3 instances</li>
                <li>If <strong>names</strong> has 2 elements → Element 3 uses <code>null</code></li>
              </ul>
              <p style={{ marginTop: 12 }}><strong>Array Template (Leading):</strong></p>
              <ul style={{ lineHeight: 1.8 }}>
                <li>Array length determines batch count (e.g., 5 objects → 5 instances)</li>
                <li>Variables are matched by index to array elements</li>
                <li>If variable array is shorter → Remaining elements use <code>null</code></li>
                <li>If variable array is longer → Extra values are ignored</li>
              </ul>
            </div>

            <div style={{ background: '#e6f7ff', padding: 12, borderRadius: 4, border: '1px solid #91d5ff' }}>
              <strong>💡 Tip:</strong> All elements in a variable array must be the same type. For example, [1, 2, 3] is valid, but [1, "two", 3] is not.
            </div>

            <div style={{ background: '#fff7e6', padding: 12, borderRadius: 4, border: '1px solid #ffd591', marginTop: 12 }}>
              <strong>⚠️ Batch Limit:</strong> Maximum 50 process instances can be started at once.
            </div>
          </Space>
        </Modal>
      )}

      {/* Expanded Variable Editor Modal */}
      {expandedVariable !== null && (() => {
        // Validate the expanded variable value
        let isValid = false;
        try {
          const parsed = JSON.parse(expandedVariable.value);
          if (Array.isArray(parsed)) {
            // Check type consistency
            if (parsed.length === 0) {
              isValid = true;
            } else {
              const firstType = getValueType(parsed[0]);
              isValid = parsed.every(el => getValueType(el) === firstType);
            }
          }
        } catch {
          // Invalid JSON
          isValid = false;
        }

        return (
          <Modal
            open={true}
            onCancel={() => setExpandedVariable(null)}
            title="Edit Variable Value"
            width={600}
            onOk={() => {
              if (expandedVariable) {
                const updated = [...variables];
                updated[expandedVariable.index] = {
                  ...updated[expandedVariable.index],
                  value: expandedVariable.value
                };
                setVariables(updated);
                setExpandedVariable(null);
              }
            }}
            okText="Apply"
            okButtonProps={{ disabled: !isValid }}
          >
          <div>
            <div style={{ marginBottom: 8, fontSize: 12, color: '#888' }}>
              Enter a JSON array (e.g., [1, 2, 3] or ["a", "b", "c"])
            </div>
            <TextArea
              rows={12}
              value={expandedVariable.value}
              onChange={e => setExpandedVariable({ ...expandedVariable, value: e.target.value })}
              placeholder='[\n  "value1",\n  "value2",\n  "value3"\n]'
              style={{ fontFamily: 'monospace', fontSize: 13 }}
            />
            {(() => {
              try {
                const parsed = JSON.parse(expandedVariable.value);
                if (!Array.isArray(parsed)) {
                  return (
                    <Alert
                      type="error"
                      message="Must be a JSON array"
                      style={{ marginTop: 8 }}
                      showIcon
                    />
                  );
                }

                // Check type consistency if array has elements
                if (parsed.length > 0) {
                  const firstType = getValueType(parsed[0]);
                  const allSameType = parsed.every(el => getValueType(el) === firstType);

                  if (!allSameType) {
                    const types = [...new Set(parsed.map(el => getValueType(el)))].join(', ');
                    return (
                      <Alert
                        type="error"
                        message="All array elements must be the same type"
                        description={`Found: ${types}`}
                        style={{ marginTop: 8 }}
                        showIcon
                      />
                    );
                  }
                }

                return (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#52c41a' }}>
                    ✓ Valid JSON array with {parsed.length} element(s)
                  </div>
                );
              } catch (error) {
                return (
                  <Alert
                    type="error"
                    message="Invalid JSON"
                    description={String(error)}
                    style={{ marginTop: 8 }}
                    showIcon
                  />
                );
              }
            })()}
          </div>
        </Modal>
        );
      })()}
    </Modal>
  );
}

// Batch Warning Component
function BatchWarning({
  count,
  level,
  isArray,
  hasMismatch,
  mismatchVars,
}: {
  count: number;
  level: string;
  isArray: boolean;
  hasMismatch: boolean;
  mismatchVars: { key: string; length: number }[];
}) {
  const getMessage = () => {
    if (level === 'blocked') {
      return 'Maximum 50 instances exceeded. Please reduce the count.';
    }
    if (level === 'warning') {
      return 'Starting more than 25 instances at once may impact performance.';
    }
    if (level === 'caution') {
      return 'Consider starting instances in smaller batches for better control.';
    }
    return null;
  };

  const getType = () => {
    if (level === 'blocked') return 'error';
    if (level === 'warning') return 'warning';
    if (level === 'caution') return 'warning';
    return 'success';
  };

  const message = getMessage();

  return (
    <div>
      {isArray && (
        <Alert
          type="info"
          message={`Batch mode: ${count} instances`}
          description="Each array element will be used as variables for one instance."
          showIcon
          style={{ marginBottom: 8 }}
        />
      )}

      {hasMismatch && (
        <Alert
          type="warning"
          message="Arrays have different lengths"
          description={
            <div>
              Shorter arrays will use null for missing values:
              <div style={{ marginTop: 4 }}>
                {mismatchVars.map(v => (
                  <div key={v.key}>• {v.key}: {v.length} element(s)</div>
                ))}
              </div>
            </div>
          }
          showIcon
          style={{ marginBottom: 8 }}
        />
      )}

      {message && (
        <Alert
          type={getType()}
          message={`Creating ${count} instance${count !== 1 ? 's' : ''}`}
          description={message}
          showIcon
        />
      )}
    </div>
  );
}

// Variable replacement utility - replaces {{varName}} with values from varMap
// Handles types intelligently:
// - If value is string and contains ONLY {{var}}, replace with actual value (any type)
// - If value is string and contains {{var}} mixed with text, treat {{var}} as string
function applyVariableReplacements(obj: any, varMap: Record<string, any>): any {
  if (typeof obj === 'string') {
    // Check if the string is EXACTLY a variable reference (e.g., "{{var}}" with nothing else)
    const exactMatch = obj.match(/^\{\{(\w+)\}\}$/);
    if (exactMatch) {
      const varName = exactMatch[1];
      if (varName in varMap) {
        // Return the actual value (preserving type: number, boolean, object, etc.)
        return varMap[varName];
      }
    }

    // String contains variables mixed with other text - replace with string representations
    let result = obj;
    for (const [key, value] of Object.entries(varMap)) {
      const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      // Convert value to string for interpolation
      const replacement = typeof value === 'string' ? value : JSON.stringify(value);
      result = result.replace(pattern, replacement);
    }
    return result;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => applyVariableReplacements(item, varMap));
  }

  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const key in obj) {
      result[key] = applyVariableReplacements(obj[key], varMap);
    }
    return result;
  }

  return obj;
}

