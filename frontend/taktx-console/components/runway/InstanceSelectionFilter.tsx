'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Input, Tabs, Space, Alert, Button, App, Tooltip, Modal } from 'antd';
import { CopyOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import { loadBatches, deleteBatch, saveBatch, batchExists, type BatchInfo } from '@/lib/utils/batchStorage';

const { TextArea } = Input;

interface InstanceSelectionFilterProps {
  /** Callback when manual instance IDs change */
  onManualIdsChange: (ids: string[]) => void;
  /** Callback when selected bookmark changes (single selection) */
  onSelectedBookmarkChange: (bookmarkName: string | null) => void;
  /** Current manual instance IDs */
  manualInstanceIds: string[];
  /** Current selected bookmark name (single selection) */
  selectedBookmark: string | null;
  /** Refresh trigger - increment to force bookmark list reload */
  bookmarkRefreshTrigger?: number;
  /** Callback when bookmark is saved to trigger refresh */
  onBookmarkSaved?: () => void;
  /** Current active mode */
  instanceSelectionMode?: 'manual' | 'bookmarks';
  /** Callback when mode changes */
  onInstanceSelectionModeChange?: (mode: 'manual' | 'bookmarks') => void;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_ID_REGEX = /^\d{10,19}$/; // Accept Long integer IDs (10-19 digits) from TaktX backend

/**
 * Instance Selection Filter - allows filtering by manual instance IDs or bookmarks
 * Accepts both UUID format and Long integer IDs
 */
export default function InstanceSelectionFilter({
  onManualIdsChange,
  onSelectedBookmarkChange,
  manualInstanceIds,
  selectedBookmark,
  bookmarkRefreshTrigger = 0,
  onBookmarkSaved,
  instanceSelectionMode,
  onInstanceSelectionModeChange,
}: InstanceSelectionFilterProps) {
  const { message, modal } = App.useApp();
  const [internalMode, setInternalMode] = useState<'manual' | 'bookmarks'>('manual');

  // Use controlled mode if provided, otherwise use internal mode
  const mode = instanceSelectionMode !== undefined ? instanceSelectionMode : internalMode;
  const setMode = useCallback((newMode: 'manual' | 'bookmarks') => {
    if (onInstanceSelectionModeChange) {
      onInstanceSelectionModeChange(newMode);
    } else {
      setInternalMode(newMode);
    }
  }, [onInstanceSelectionModeChange]);
  const [manualInput, setManualInput] = useState('');
  const [bookmarkSearch, setBookmarkSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name'>('newest');
  const [bookmarksSelectedForDeletion, setBookmarksSelectedForDeletion] = useState<string[]>([]);
  const [showSaveBookmarkModal, setShowSaveBookmarkModal] = useState(false);
  const [newBookmarkName, setNewBookmarkName] = useState('');
  const [deletionTrigger, setDeletionTrigger] = useState(0); // Counter to trigger refresh after deletion

  // Track previous manualInstanceIds to detect external changes
  const prevManualInstanceIdsRef = useRef<string[]>([]);

  // Sync manualInput textarea with manualInstanceIds prop
  // This allows parent to populate the textarea (e.g., when starting instances without bookmark)
  useEffect(() => {
    // Create a stable string representation to compare
    const currentStr = [...manualInstanceIds].sort().join(',');
    const prevStr = [...prevManualInstanceIdsRef.current].sort().join(',');

    // Only update if manualInstanceIds changed from parent
    if (currentStr !== prevStr) {
      setManualInput(manualInstanceIds.join('\n'));
      prevManualInstanceIdsRef.current = [...manualInstanceIds];

      // Auto-switch to manual mode when manual IDs are populated from parent
      if (manualInstanceIds.length > 0) {
        setMode('manual');
      }
    }
  }, [manualInstanceIds, setMode]);

  // Auto-switch to bookmarks mode when a bookmark is selected
  useEffect(() => {
    if (selectedBookmark) {
      setMode('bookmarks');
    }
  }, [selectedBookmark, setMode]);

  // Load bookmarks from localStorage
  const bookmarkReloadKey = `${deletionTrigger}:${bookmarkRefreshTrigger}`;
  const bookmarks = useMemo(() => {
    void bookmarkReloadKey;
    return loadBatches();
  }, [bookmarkReloadKey]); // Re-load when deletion happens or refresh triggered

  // Filter bookmarks by search
  const filteredBookmarks = useMemo(() => {
    let filtered = bookmarks;

    if (bookmarkSearch) {
      const search = bookmarkSearch.toLowerCase();
      filtered = filtered.filter(b => b.name.toLowerCase().includes(search));
    }

    // Sort
    if (sortBy === 'newest') {
      filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } else if (sortBy === 'oldest') {
      filtered.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    } else if (sortBy === 'name') {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    }

    return filtered;
  }, [bookmarks, bookmarkSearch, sortBy]);

  // Parse manual input and validate UUIDs
  const parseManualInput = (input: string): { valid: string[]; invalid: string[]; duplicates: string[] } => {
    // Split by comma, space, or newline
    const tokens = input
      .split(/[\s,]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const valid: string[] = [];
    const invalid: string[] = [];
    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const token of tokens) {
      // Accept both UUID format and Long integer format (Camunda/Zeebe)
      if (UUID_REGEX.test(token) || LONG_ID_REGEX.test(token)) {
        if (seen.has(token)) {
          duplicates.push(token);
        } else {
          valid.push(token);
          seen.add(token);
        }
      } else {
        invalid.push(token);
      }
    }

    return { valid, invalid, duplicates };
  };

  const handleManualInputChange = (value: string) => {
    setManualInput(value);
    // Don't automatically update parent - wait for user to click Apply button
  };

  const handleApplyManualIds = () => {
    const { valid } = parseManualInput(manualInput);
    onManualIdsChange(valid);
  };

  const handleBookmarkToggle = (bookmarkName: string) => {
    if (selectedBookmark === bookmarkName) {
      // Clicking on already selected bookmark deselects it
      onSelectedBookmarkChange(null);
    } else {
      // Select this bookmark
      onSelectedBookmarkChange(bookmarkName);
    }
  };

  const handleToggleDeletionSelection = (bookmarkName: string) => {
    if (bookmarksSelectedForDeletion.includes(bookmarkName)) {
      setBookmarksSelectedForDeletion(bookmarksSelectedForDeletion.filter(b => b !== bookmarkName));
    } else {
      setBookmarksSelectedForDeletion([...bookmarksSelectedForDeletion, bookmarkName]);
    }
  };

  const handleTabChange = (key: string) => {
    setMode(key as 'manual' | 'bookmarks');
    // Don't clear values - let the parent handle state restoration via viewStateStorage
  };

  const handleSelectAllForDeletion = () => {
    setBookmarksSelectedForDeletion(filteredBookmarks.map(b => b.name));
  };

  const handleDeselectAllForDeletion = () => {
    setBookmarksSelectedForDeletion([]);
  };

  const handleDeleteSelected = () => {
    if (bookmarksSelectedForDeletion.length === 0) return;

    modal.confirm({
      title: `Delete ${bookmarksSelectedForDeletion.length} Bookmark${bookmarksSelectedForDeletion.length !== 1 ? 's' : ''}`,
      content: `Are you sure you want to delete ${bookmarksSelectedForDeletion.length} bookmark${bookmarksSelectedForDeletion.length !== 1 ? 's' : ''}?`,
      okText: 'Delete',
      okType: 'danger',
      onOk: () => {
        try {
          bookmarksSelectedForDeletion.forEach(name => {
            deleteBatch(name);
            // If the deleted bookmark was selected, clear selection
            if (selectedBookmark === name) {
              onSelectedBookmarkChange(null);
            }
          });
          message.success(`Deleted ${bookmarksSelectedForDeletion.length} bookmark${bookmarksSelectedForDeletion.length !== 1 ? 's' : ''}`);
          setBookmarksSelectedForDeletion([]);
          // Trigger refresh of bookmarks list
          setDeletionTrigger(prev => prev + 1);
        } catch (error) {
          message.error(`Failed to delete bookmarks: ${error}`);
        }
      },
    });
  };

  const handleDeleteBookmark = (bookmarkName: string) => {
    modal.confirm({
      title: 'Delete Bookmark',
      content: `Are you sure you want to delete the bookmark "${bookmarkName}"?`,
      okText: 'Delete',
      okType: 'danger',
      onOk: () => {
        try {
          deleteBatch(bookmarkName);
          // Remove from selection if selected
          if (selectedBookmark === bookmarkName) {
            onSelectedBookmarkChange(null);
          }
          // Remove from deletion selection if selected
          if (bookmarksSelectedForDeletion.includes(bookmarkName)) {
            setBookmarksSelectedForDeletion(bookmarksSelectedForDeletion.filter(b => b !== bookmarkName));
          }
          // Trigger refresh of bookmarks list
          setDeletionTrigger(prev => prev + 1);
          message.success(`Bookmark "${bookmarkName}" deleted`);
        } catch (error) {
          message.error(`Failed to delete bookmark: ${error}`);
        }
      },
    });
  };

  const handleExportBookmark = (bookmark: BatchInfo) => {
    const text = bookmark.instanceIds.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      message.success(`Copied ${bookmark.instanceIds.length} instance IDs to clipboard`);
    }).catch((error) => {
      message.error(`Failed to copy to clipboard: ${error}`);
    });
  };

  const handleSaveManualIdsToBookmark = () => {
    if (manualInstanceIds.length === 0) {
      message.error('No instance IDs to save');
      return;
    }

    if (manualInstanceIds.length > 50) {
      message.error('Cannot save more than 50 instances to a bookmark');
      return;
    }

    setNewBookmarkName('');
    setShowSaveBookmarkModal(true);
  };

  const handleConfirmSaveBookmark = () => {
    const name = newBookmarkName.trim();

    if (!name) {
      message.error('Bookmark name is required');
      return;
    }

    // Check if bookmark exists
    if (batchExists(name)) {
      modal.confirm({
        title: 'Bookmark already exists',
        content: `A bookmark named "${name}" already exists. Do you want to overwrite it?`,
        onOk: () => {
          performSave(name);
        },
      });
    } else {
      performSave(name);
    }
  };

  const performSave = (name: string) => {
    try {
      saveBatch({
        name,
        instanceIds: manualInstanceIds,
        timestamp: new Date().toISOString(),
        // No need to save processDefinitionId or version - instance IDs are self-contained
      });
      message.success(`Bookmark "${name}" saved with ${manualInstanceIds.length} instance${manualInstanceIds.length !== 1 ? 's' : ''}`);
      setShowSaveBookmarkModal(false);
      setNewBookmarkName('');

      // Notify parent to trigger refresh and select bookmark
      onBookmarkSaved?.();

      // Select the newly saved bookmark
      onSelectedBookmarkChange(name);
    } catch (error) {
      message.error(`Failed to save bookmark: ${error}`);
    }
  };

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Calculate stats
  const manualValidation = useMemo(() => parseManualInput(manualInput), [manualInput]);
  const totalSelectedInstances = useMemo(() => {
    if (!selectedBookmark) return 0;
    const bookmark = bookmarks.find(b => b.name === selectedBookmark);
    return bookmark ? bookmark.instanceIds.length : 0;
  }, [bookmarks, selectedBookmark]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Tabs
        activeKey={mode}
        onChange={handleTabChange}
        style={{ height: '100%' }}
        items={[
          {
            key: 'manual',
            label: `Manual IDs${manualInstanceIds.length > 0 ? ` (${manualInstanceIds.length})` : ''}`,
            children: (
              <div>
                <Space direction="vertical" style={{ width: '100%' }} size="large">
                  <div>
                    <TextArea
                      data-testid="instance-filter-manual-ids-input"
                      rows={12}
                      placeholder="Enter instance IDs (UUID or numeric format, comma/space/newline separated)"
                      value={manualInput}
                      onChange={(e) => handleManualInputChange(e.target.value)}
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 13,
                        borderRadius: 6,
                      }}
                    />
                    {(manualValidation.valid.length > 0 || manualValidation.invalid.length > 0 || manualValidation.duplicates.length > 0) && (
                      <div style={{
                        marginTop: 12,
                        padding: '8px 12px',
                        background: '#fafafa',
                        borderRadius: 6,
                        fontSize: 13,
                      }}>
                        {manualValidation.valid.length > 0 && (
                          <div style={{ color: '#52c41a', marginBottom: 4, fontWeight: 500 }}>
                            ✓ {manualValidation.valid.length} valid ID{manualValidation.valid.length !== 1 ? 's' : ''}
                          </div>
                        )}
                        {manualValidation.invalid.length > 0 && (
                          <div style={{ color: '#ff4d4f', marginBottom: 4, fontWeight: 500 }}>
                            ✗ {manualValidation.invalid.length} invalid ID{manualValidation.invalid.length !== 1 ? 's' : ''}
                          </div>
                        )}
                        {manualValidation.duplicates.length > 0 && (
                          <div style={{ color: '#faad14', fontWeight: 500 }}>
                            ⚠ {manualValidation.duplicates.length} duplicate{manualValidation.duplicates.length !== 1 ? 's' : ''} removed
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {manualValidation.valid.length > 50 && (
                    <Alert
                      type="error"
                      message="Too many instances"
                      description="Maximum 50 instance IDs allowed. Please reduce the number of IDs."
                      showIcon
                    />
                  )}

                  <div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <Button
                        data-testid="instance-filter-apply-manual-ids"
                        type="primary"
                        onClick={handleApplyManualIds}
                        disabled={manualValidation.valid.length === 0 || manualValidation.valid.length > 50}
                        style={{ flex: 1 }}
                      >
                        Apply
                      </Button>
                      <Button
                        data-testid="instance-filter-clear-manual-ids"
                        onClick={() => {
                          setManualInput('');
                          onManualIdsChange([]);
                        }}
                        disabled={manualInput.trim() === ''}
                        style={{ flex: 1 }}
                      >
                        Clear
                      </Button>
                    </div>
                    {manualValidation.valid.length > 0 && manualValidation.valid.length <= 50 && (
                      <Button
                        data-testid="instance-filter-save-to-bookmark"
                        icon={<SaveOutlined />}
                        onClick={handleSaveManualIdsToBookmark}
                        title="Save these instances to a bookmark"
                        block
                      >
                        Save to Bookmark
                      </Button>
                    )}
                  </div>
                </Space>
              </div>
            ),
          },
          {
            key: 'bookmarks',
            label: `Bookmarks${selectedBookmark ? ' (1 selected)' : ''}`,
            children: (
              <div style={{ padding: '16px 0' }}>
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  {/* Search */}
                  <Input
                    data-testid="instance-filter-bookmark-search"
                    placeholder="Search bookmarks..."
                    value={bookmarkSearch}
                    onChange={(e) => setBookmarkSearch(e.target.value)}
                    allowClear
                    style={{ borderRadius: 6 }}
                  />

                  {/* Sort Controls - Compact */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                    <span style={{ color: '#8c8c8c' }}>Sort:</span>
                    <Button
                      size="small"
                      type={sortBy === 'newest' ? 'primary' : 'default'}
                      onClick={() => setSortBy('newest')}
                    >
                      Newest
                    </Button>
                    <Button
                      size="small"
                      type={sortBy === 'oldest' ? 'primary' : 'default'}
                      onClick={() => setSortBy('oldest')}
                    >
                      Oldest
                    </Button>
                    <Button
                      size="small"
                      type={sortBy === 'name' ? 'primary' : 'default'}
                      onClick={() => setSortBy('name')}
                    >
                      Name
                    </Button>
                  </div>

                  {/* Bulk Actions - Only show when items selected */}
                  {bookmarksSelectedForDeletion.length > 0 && (
                    <div style={{
                      padding: '8px 12px',
                      background: '#fff7e6',
                      borderRadius: 6,
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <span style={{ fontSize: 13, color: '#595959' }}>
                        {bookmarksSelectedForDeletion.length} selected
                      </span>
                      <Space size="small">
                        <Button
                          size="small"
                          onClick={handleDeselectAllForDeletion}
                        >
                          Clear
                        </Button>
                        <Button
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={handleDeleteSelected}
                        >
                          Delete
                        </Button>
                      </Space>
                    </div>
                  )}

                  {/* Summary - Only show warnings */}
                  {totalSelectedInstances > 200 && (
                    <Alert
                      type="error"
                      message="Too many instances"
                      description="Selected bookmark contains more than 200 instances."
                      showIcon
                    />
                  )}

                  {totalSelectedInstances > 50 && totalSelectedInstances <= 200 && (
                    <Alert
                      type="warning"
                      message={`${totalSelectedInstances} instances - may impact performance`}
                      showIcon
                    />
                  )}

                  {/* Bookmark Table */}
                  {filteredBookmarks.length === 0 ? (
                    <div style={{
                      textAlign: 'center',
                      padding: '48px 16px',
                      color: '#8c8c8c',
                      fontSize: 13,
                    }}>
                      {bookmarkSearch ? 'No bookmarks match your search' : 'No bookmarks saved yet'}
                    </div>
                  ) : (
                    <div style={{
                      border: '1px solid #d9d9d9',
                      borderRadius: 6,
                      overflow: 'hidden',
                    }}>
                      {/* Table Header */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '8px 12px',
                        background: '#fafafa',
                        borderBottom: '1px solid #d9d9d9',
                        fontSize: 12,
                        fontWeight: 500,
                        color: '#595959',
                      }}>
                        <div style={{ width: 32, flexShrink: 0 }}>
                          <input
                            type="checkbox"
                            checked={bookmarksSelectedForDeletion.length === filteredBookmarks.length && filteredBookmarks.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                handleSelectAllForDeletion();
                              } else {
                                handleDeselectAllForDeletion();
                              }
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                        </div>
                        <div style={{ flex: 1 }}>Name</div>
                        <div style={{ width: 50, textAlign: 'center' }}>Count</div>
                        <div style={{ width: 60, flexShrink: 0 }}></div>
                      </div>

                      {/* Table Rows */}
                      {filteredBookmarks.map((bookmark) => {
                        const isSelected = selectedBookmark === bookmark.name;
                        const isSelectedForDeletion = bookmarksSelectedForDeletion.includes(bookmark.name);
                        return (
                          <div
                            key={bookmark.name}
                            data-testid={`instance-filter-bookmark-${bookmark.name}`}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '10px 12px',
                              background: isSelected ? '#e6f7ff' : 'white',
                              borderBottom: '1px solid #f0f0f0',
                              cursor: 'pointer',
                              transition: 'background 0.2s',
                            }}
                            onClick={() => handleBookmarkToggle(bookmark.name)}
                            onMouseEnter={(e) => {
                              if (!isSelected) e.currentTarget.style.background = '#fafafa';
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected) e.currentTarget.style.background = 'white';
                            }}
                          >
                            {/* Checkbox */}
                            <div style={{ width: 32, flexShrink: 0 }}>
                              <input
                                type="checkbox"
                                checked={isSelectedForDeletion}
                                onChange={() => handleToggleDeletionSelection(bookmark.name)}
                                onClick={(e) => e.stopPropagation()}
                                style={{ cursor: 'pointer' }}
                              />
                            </div>

                            {/* Name */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <Tooltip title={bookmark.name}>
                                <div
                                  style={{
                                    fontWeight: isSelected ? 600 : 500,
                                    fontSize: 13,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    color: isSelected ? '#1890ff' : '#262626',
                                    marginBottom: 2,
                                  }}
                                >
                                  {bookmark.name}
                                </div>
                              </Tooltip>
                              <div style={{ fontSize: 11, color: '#8c8c8c' }}>
                                {formatTimestamp(bookmark.timestamp)}
                              </div>
                            </div>

                            {/* Count Badge */}
                            <div style={{ width: 50, textAlign: 'center', flexShrink: 0 }}>
                              <span
                                style={{
                                  fontSize: 11,
                                  padding: '2px 6px',
                                  background: isSelected ? '#1890ff' : '#f0f0f0',
                                  color: isSelected ? 'white' : '#595959',
                                  borderRadius: 10,
                                  fontWeight: 500,
                                }}
                              >
                                {bookmark.instanceIds.length}
                              </span>
                            </div>

                            {/* Action Icons */}
                            <div
                              style={{ width: 60, flexShrink: 0, display: 'flex', gap: 4, justifyContent: 'flex-end' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button
                                type="text"
                                size="small"
                                icon={<CopyOutlined style={{ fontSize: 14 }} />}
                                onClick={() => handleExportBookmark(bookmark)}
                                title="Copy instance IDs"
                              />
                              <Button
                                type="text"
                                size="small"
                                danger
                                icon={<DeleteOutlined style={{ fontSize: 14 }} />}
                                onClick={() => handleDeleteBookmark(bookmark.name)}
                                title="Delete bookmark"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Space>
              </div>
            ),
          },
        ]}
      />

      {/* Save Bookmark Modal */}
      <Modal
        open={showSaveBookmarkModal}
        onCancel={() => {
          setShowSaveBookmarkModal(false);
          setNewBookmarkName('');
        }}
        onOk={handleConfirmSaveBookmark}
        title="Save to Bookmark"
        okText="Save"
      >
        <div style={{ marginTop: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
            Bookmark Name
          </label>
          <Input
            placeholder="Enter bookmark name"
            value={newBookmarkName}
            onChange={(e) => setNewBookmarkName(e.target.value)}
            onPressEnter={handleConfirmSaveBookmark}
            maxLength={64}
          />
          <div style={{ marginTop: 12, fontSize: 12, color: '#8c8c8c' }}>
            This will save {manualInstanceIds.length} instance ID{manualInstanceIds.length !== 1 ? 's' : ''} to the bookmark.
          </div>
        </div>
      </Modal>
    </div>
  );
}

