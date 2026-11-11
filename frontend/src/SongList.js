import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import arrowDownIcon from './assets/icons/arrow-down.svg';
import plusIcon from './assets/icons/plus.svg';
import crossIcon from './assets/icons/cross.svg';
import './SongList.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://project-kanade-env.eba-p28hzfdj.ap-southeast-1.elasticbeanstalk.com';

function SongList() {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Sorting state: key can be 'title', 'artists', 'composers', 'year'
  const [sortKey, setSortKey] = useState('title');
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' or 'desc'

  // Selected songs state (set of song filenames)
  const [selectedSongKeys, setSelectedSongKeys] = useState(new Set());

  // In-place editing state: { filename: string, field: 'title' | 'artists' | 'composers' | 'year' }
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef(null);

  // Sequential Request Queue
  const requestQueueRef = useRef([]);
  const isProcessingQueueRef = useRef(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Tag-based search state
  const [tags, setTags] = useState([]); // [{ type: 'artist'|'composer'|'year', value: string }]
  const [tagInput, setTagInput] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const tagInputRef = useRef(null);
  const suggestionsRef = useRef(null);

  // Add Song Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newSongForm, setNewSongForm] = useState({
    filename: '',
    title: '',
    artists: '',
    composers: '',
    year: ''
  });
  const [formError, setFormError] = useState('');

  // Queue runner: strictly executes one async request after previous completes
  const processNextInQueue = async () => {
    if (isProcessingQueueRef.current || requestQueueRef.current.length === 0) {
      if (requestQueueRef.current.length === 0) {
        setIsSyncing(false);
      }
      return;
    }

    isProcessingQueueRef.current = true;
    setIsSyncing(true);

    const task = requestQueueRef.current.shift();
    try {
      await task();
    } catch (err) {
      console.error('[Request Queue] Task failed:', err);
    } finally {
      isProcessingQueueRef.current = false;
      processNextInQueue();
    }
  };

  const enqueueRequest = (taskFn) => {
    requestQueueRef.current.push(taskFn);
    processNextInQueue();
  };

  // Build suggestions based on tagInput
  const buildSuggestions = useCallback((input) => {
    if (!input) { setSuggestions([]); return; }

    const lower = input.toLowerCase();
    let newSuggestions = [];

    const artistPrefix = 'artist:';
    const composerPrefix = 'composer:';
    const yearPrefix = 'year:';

    if (lower.startsWith(artistPrefix)) {
      // Explicit artist: prefix — search only artists
      const query = lower.slice(artistPrefix.length);
      const existing = new Set(tags.filter(t => t.type === 'artist').map(t => t.value.toLowerCase()));
      const all = new Set();
      songs.forEach(s => (s.artists || []).forEach(a => all.add(a)));
      newSuggestions = [...all]
        .filter(a => a.toLowerCase().includes(query) && !existing.has(a.toLowerCase()))
        .sort()
        .slice(0, 10)
        .map(v => ({ type: 'artist', value: v }));
    } else if (lower.startsWith(composerPrefix)) {
      // Explicit composer: prefix — search only composers
      const query = lower.slice(composerPrefix.length);
      const existing = new Set(tags.filter(t => t.type === 'composer').map(t => t.value.toLowerCase()));
      const all = new Set();
      songs.forEach(s => (s.composers || []).forEach(c => all.add(c)));
      newSuggestions = [...all]
        .filter(c => c.toLowerCase().includes(query) && !existing.has(c.toLowerCase()))
        .sort()
        .slice(0, 10)
        .map(v => ({ type: 'composer', value: v }));
    } else if (lower.startsWith(yearPrefix)) {
      // Explicit year: prefix — search only years
      const query = lower.slice(yearPrefix.length);
      const existing = new Set(tags.filter(t => t.type === 'year').map(t => t.value));
      const all = new Set();
      songs.forEach(s => { if (s.year) all.add(String(s.year)); });
      newSuggestions = [...all]
        .filter(y => y.includes(query) && !existing.has(y))
        .sort((a, b) => b - a)
        .slice(0, 10)
        .map(v => ({ type: 'year', value: v }));
    } else {
      // No prefix — search across ALL artists, composers, and years simultaneously
      const existingArtists = new Set(tags.filter(t => t.type === 'artist').map(t => t.value.toLowerCase()));
      const existingComposers = new Set(tags.filter(t => t.type === 'composer').map(t => t.value.toLowerCase()));
      const existingYears = new Set(tags.filter(t => t.type === 'year').map(t => t.value));

      const allArtists = new Set();
      const allComposers = new Set();
      const allYears = new Set();
      songs.forEach(s => {
        (s.artists || []).forEach(a => allArtists.add(a));
        (s.composers || []).forEach(c => allComposers.add(c));
        if (s.year) allYears.add(String(s.year));
      });

      const matchedArtists = [...allArtists]
        .filter(a => a.toLowerCase().includes(lower) && !existingArtists.has(a.toLowerCase()))
        .sort()
        .slice(0, 5)
        .map(v => ({ type: 'artist', value: v }));

      const matchedComposers = [...allComposers]
        .filter(c => c.toLowerCase().includes(lower) && !existingComposers.has(c.toLowerCase()))
        .sort()
        .slice(0, 5)
        .map(v => ({ type: 'composer', value: v }));

      const matchedYears = [...allYears]
        .filter(y => y.includes(lower) && !existingYears.has(y))
        .sort((a, b) => b - a)
        .slice(0, 3)
        .map(v => ({ type: 'year', value: v }));

      // Interleave: artists first, then composers, then years, cap at 10 total
      newSuggestions = [...matchedArtists, ...matchedComposers, ...matchedYears].slice(0, 10);
    }

    setSuggestions(newSuggestions);
    setActiveSuggestion(-1);
  }, [songs, tags]);

  useEffect(() => {
    // Build suggestions whenever the visible input value changes
    buildSuggestions(tagInput || searchQuery);
  }, [tagInput, searchQuery, buildSuggestions]);

  const selectSuggestion = (suggestion) => {
    setTags(prev => [...prev, { type: suggestion.type, value: suggestion.value }]);
    setTagInput('');
    setSearchQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveSuggestion(-1);
    setTimeout(() => tagInputRef.current && tagInputRef.current.focus(), 0);
  };

  const removeTag = (idx) => {
    setTags(prev => prev.filter((_, i) => i !== idx));
  };

  const handleTagInputKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestion(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestion(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Tab') {
      if (suggestions.length > 0) {
        e.preventDefault();
        selectSuggestion(suggestions[activeSuggestion >= 0 ? activeSuggestion : 0]);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeSuggestion >= 0 && suggestions[activeSuggestion]) {
        selectSuggestion(suggestions[activeSuggestion]);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setActiveSuggestion(-1);
    }
  };

  // Close suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        tagInputRef.current && !tagInputRef.current.closest('.search-tag-container')?.contains(e.target)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchSongs = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/songs`);
      if (!response.ok) {
        throw new Error(`Failed to load songs (HTTP ${response.status})`);
      }
      const data = await response.json();
      setSongs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching songs:', err);
      setError(err.message || 'Unable to connect to the backend server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSongs();
  }, []);

  // Auto-focus input when editing starts
  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      if (editInputRef.current.select) {
        editInputRef.current.select();
      }
    }
  }, [editingCell]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  // Filter and sort songs
  const processedSongs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    // 1. Filter by text query
    let filtered = songs.filter((song) => {
      if (!q) return true;

      const displayTitle = (song.title || song.filename || '').toLowerCase();
      const artistMatch = (song.artists || []).some((a) =>
        a.toLowerCase().includes(q)
      );
      const composerMatch = (song.composers || []).some((c) =>
        c.toLowerCase().includes(q)
      );
      const yearMatch = song.year != null && String(song.year).includes(q);

      return displayTitle.includes(q) || artistMatch || composerMatch || yearMatch;
    });

    // 2. Filter by tags
    tags.forEach(tag => {
      if (tag.type === 'artist') {
        filtered = filtered.filter(s =>
          (s.artists || []).some(a => a.toLowerCase() === tag.value.toLowerCase())
        );
      } else if (tag.type === 'composer') {
        filtered = filtered.filter(s =>
          (s.composers || []).some(c => c.toLowerCase() === tag.value.toLowerCase())
        );
      } else if (tag.type === 'year') {
        filtered = filtered.filter(s => String(s.year) === tag.value);
      }
    });

    // 2. Sort
    filtered.sort((a, b) => {
      let valA, valB;

      if (sortKey === 'title') {
        valA = (a.title || a.filename || '').toLowerCase();
        valB = (b.title || b.filename || '').toLowerCase();
      } else if (sortKey === 'artists') {
        valA = (a.artists && a.artists.length > 0 ? a.artists[0] : '').toLowerCase();
        valB = (b.artists && b.artists.length > 0 ? b.artists[0] : '').toLowerCase();
      } else if (sortKey === 'composers') {
        valA = (a.composers && a.composers.length > 0 ? a.composers[0] : '').toLowerCase();
        valB = (b.composers && b.composers.length > 0 ? b.composers[0] : '').toLowerCase();
      } else if (sortKey === 'year') {
        valA = a.year || 0;
        valB = b.year || 0;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [songs, searchQuery, sortKey, sortOrder, tags]);

  // Checkbox toggle logic
  const isAllSelected = useMemo(() => {
    if (processedSongs.length === 0) return false;
    return processedSongs.every((song) =>
      selectedSongKeys.has(song.filename)
    );
  }, [processedSongs, selectedSongKeys]);

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      const next = new Set(selectedSongKeys);
      processedSongs.forEach((song) => {
        next.delete(song.filename);
      });
      setSelectedSongKeys(next);
    } else {
      const next = new Set(selectedSongKeys);
      processedSongs.forEach((song) => {
        next.add(song.filename);
      });
      setSelectedSongKeys(next);
    }
  };

  const handleToggleRow = (filename) => {
    const next = new Set(selectedSongKeys);
    if (next.has(filename)) {
      next.delete(filename);
    } else {
      next.add(filename);
    }
    setSelectedSongKeys(next);
  };

  // EDIT: Start cell editing
  const handleStartEditing = (song, field, e) => {
    e.stopPropagation();
    let initialValue = '';
    if (field === 'title') {
      initialValue = song.title || '';
    } else if (field === 'artists') {
      initialValue = (song.artists || []).join(' / ');
    } else if (field === 'composers') {
      initialValue = (song.composers || []).join(' / ');
    } else if (field === 'year') {
      initialValue = song.year != null ? String(song.year) : '';
    }

    setEditingCell({ filename: song.filename, field });
    setEditValue(initialValue);
  };

  // EDIT: Save cell edit locally immediately + queue PUT request to backend
  const handleSaveEdit = (valueToSave) => {
    if (!editingCell) return;
    const { filename, field } = editingCell;
    const finalValue = valueToSave !== undefined ? valueToSave : editValue;

    let payload = {};
    if (field === 'title') {
      payload.title = finalValue.trim();
    } else if (field === 'artists') {
      payload.artists = finalValue
        .split('/')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (field === 'composers') {
      payload.composers = finalValue
        .split('/')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (field === 'year') {
      const num = parseInt(String(finalValue).trim(), 10);
      payload.year = !isNaN(num) ? num : null;
    }

    // 1. Instant local UI state update
    setSongs((prevSongs) =>
      prevSongs.map((song) => {
        if (song.filename !== filename) return song;
        return { ...song, ...payload };
      })
    );

    // Close editor
    setEditingCell(null);
    setEditValue('');

    // 2. Enqueue sequential network request
    enqueueRequest(async () => {
      try {
        const resp = await fetch(
          `${API_BASE_URL}/songs/${encodeURIComponent(filename)}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }
        );
        if (!resp.ok) {
          throw new Error(`Failed to update song on server (HTTP ${resp.status})`);
        }
      } catch (err) {
        console.error('Error in queued song update:', err);
      }
    });
  };

  const handleCancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit(e.target.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  // CREATE: Add new song (POST /songs) with queue
  const handleCreateSong = (e) => {
    e.preventDefault();
    setFormError('');

    if (!newSongForm.filename.trim()) {
      setFormError('Filename is required (e.g., song.mp3).');
      return;
    }

    const payload = {
      filename: newSongForm.filename.trim(),
      title: newSongForm.title.trim() || undefined,
      artists: newSongForm.artists
        .split('/')
        .map((s) => s.trim())
        .filter(Boolean),
      composers: newSongForm.composers
        .split('/')
        .map((s) => s.trim())
        .filter(Boolean),
      year: newSongForm.year.trim() ? parseInt(newSongForm.year.trim(), 10) : null
    };

    // Optimistic UI update
    const optimisticSong = {
      ...payload,
      title: payload.title || payload.filename
    };
    setSongs((prev) => [optimisticSong, ...prev]);
    setIsAddModalOpen(false);
    setNewSongForm({ filename: '', title: '', artists: '', composers: '', year: '' });

    // Enqueue sequential POST request
    enqueueRequest(async () => {
      try {
        const resp = await fetch(`${API_BASE_URL}/songs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${resp.status}`);
        }
      } catch (err) {
        console.error('Error creating song:', err);
        fetchSongs(); // Resync on failure
      }
    });
  };

  // DELETE: Batch delete selected songs with queue
  const handleDeleteSelected = () => {
    const filenamesToDelete = Array.from(selectedSongKeys);
    if (filenamesToDelete.length === 0) return;

    let confirmMsg = '';
    if (filenamesToDelete.length === 1) {
      const singleSong = songs.find((s) => s.filename === filenamesToDelete[0]);
      const songTitle = (singleSong && (singleSong.title || singleSong.filename)) || filenamesToDelete[0];
      confirmMsg = `Deleteing "${songTitle}" from playlist, are you sure?`;
    } else {
      confirmMsg = `Deleteing ${filenamesToDelete.length} songs from playlist, are you sure?`;
    }

    if (!window.confirm(confirmMsg)) return;

    // Optimistically update
    setSongs((prev) =>
      prev.filter((s) => !selectedSongKeys.has(s.filename))
    );
    setSelectedSongKeys(new Set());

    // Enqueue sequential DELETE request
    enqueueRequest(async () => {
      try {
        const resp = await fetch(`${API_BASE_URL}/songs`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filenames: filenamesToDelete })
        });
        if (!resp.ok) {
          throw new Error(`Failed to delete on server (HTTP ${resp.status})`);
        }
      } catch (err) {
        console.error('Error deleting songs:', err);
        fetchSongs();
      }
    });
  };

  const renderSortIndicator = (key) => {
    if (sortKey !== key) {
      return null;
    }
    return (
      <span className={`sort-icon-wrapper ${sortOrder === 'asc' ? 'sort-asc' : 'sort-desc'}`}>
        <img src={arrowDownIcon} alt={sortOrder} className="sort-arrow-icon" />
      </span>
    );
  };

  return (
    <div className="song-list-container">
      {/* Playlist Header */}
      <div className="playlist-header">
        <div className="title-row">
          <h1 className="playlist-title">
            <span className="playlist-author">KYoru</span>'s playlist
          </h1>
          {isSyncing && (
            <span className="sync-indicator" title="Saving changes...">
              <span className="sync-dot"></span>
              Saving...
            </span>
          )}
        </div>
        <p className="playlist-subtitle">
          Feel free to modify your playlist!
          <br />
          The artist and composer fields support multiple values, separated by a slash ('/').
        </p>
      </div>

      {/* Top Action Bar */}
      <div className="top-action-bar">
        <button
          className="add-song-btn"
          onClick={() => {
            setFormError('');
            setIsAddModalOpen(true);
          }}
        >
          <img src={plusIcon} alt="" className="add-plus-icon" />
          <span>Add</span>
        </button>

        <button
          className="delete-song-btn"
          onClick={handleDeleteSelected}
          disabled={selectedSongKeys.size === 0}
          title={selectedSongKeys.size === 0 ? 'Select songs to delete' : 'Delete selected songs'}
        >
          <span>Delete</span>
        </button>
      </div>

      {/* Controls Bar */}
      <div className="controls-bar">
        <div className={`search-tag-container${tags.length > 0 ? ' has-chips' : ''}`}>
          <div className="search-box">
            <svg
              className="search-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              className="search-input"
              placeholder={tags.length > 0 ? 'Add another filter…' : 'Search or type artist:, composer:, year:'}
              value={tagInput || searchQuery}
              onChange={(e) => {
                const val = e.target.value;
                const lower = val.toLowerCase();
                // If it starts with a tag prefix, treat as tagInput (pure filter, not text search)
                if (lower.startsWith('artist:') || lower.startsWith('composer:') || lower.startsWith('year:')) {
                  setTagInput(val);
                  setSearchQuery('');
                } else {
                  // Free text: drives searchQuery, and also drives suggestions
                  setTagInput('');
                  setSearchQuery(val);
                }
                setShowSuggestions(true);
              }}
              onFocus={() => {
                buildSuggestions(tagInput || searchQuery);
                setShowSuggestions(true);
              }}
              onKeyDown={handleTagInputKeyDown}
              ref={tagInputRef}
              autoComplete="off"
            />
            {(tagInput || searchQuery) && (
              <button
                className="clear-search-btn"
                onClick={() => { setTagInput(''); setSearchQuery(''); setSuggestions([]); setShowSuggestions(false); }}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Chip row */}
          {tags.length > 0 && (
            <div className="chip-row">
              {tags.map((tag, idx) => (
                <span key={idx} className={`search-tag-chip chip-type-${tag.type}`}>
                  <span className="chip-type-label">{tag.type}</span>
                  <span className="chip-value">{tag.value}</span>
                  <button
                    className="chip-remove-btn"
                    onClick={() => removeTag(idx)}
                    aria-label={`Remove ${tag.type}:${tag.value} filter`}
                  >
                    <img src={crossIcon} alt="remove" className="chip-cross-icon" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Suggestions dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="suggestions-dropdown" ref={suggestionsRef}>
              {suggestions.map((s, idx) => (
                <div
                  key={idx}
                  className={`suggestion-item suggestion-type-${s.type}${activeSuggestion === idx ? ' suggestion-active' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}
                  onMouseEnter={() => setActiveSuggestion(idx)}
                >
                  <span className="suggestion-badge">{s.type}</span>
                  <span className="suggestion-label">{s.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="filters-group">
          <div className="song-count-badge">
            <span className="count-number">{processedSongs.length}</span>
            <span className="count-label">
              {processedSongs.length === 1 ? 'song' : 'songs'}
            </span>
          </div>
        </div>
      </div>

      {/* States: Loading, Error, Empty, or Table */}
      {loading ? (
        <div className="state-card loading-state">
          <div className="spinner"></div>
          <p className="state-message">Loading tracklist...</p>
        </div>
      ) : error ? (
        <div className="state-card error-state">
          <div className="error-icon">⚠️</div>
          <h3 className="state-title">Failed to load songs</h3>
          <p className="state-message">{error}</p>
          <p className="state-hint">
            Make sure the backend is running at {API_BASE_URL}.
          </p>
          <button className="retry-btn" onClick={fetchSongs}>
            Retry
          </button>
        </div>
      ) : processedSongs.length === 0 ? (
        <div className="state-card empty-state">
          <div className="empty-icon">🎵</div>
          <h3 className="state-title">No songs found</h3>
          <p className="state-message">
            {searchQuery
              ? 'Try adjusting your search query.'
              : 'No songs are currently loaded in data.json.'}
          </p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="songs-table">
            <thead>
              <tr>
                <th className="col-checkbox">
                  <input
                    type="checkbox"
                    className="custom-checkbox"
                    checked={isAllSelected}
                    onChange={handleToggleSelectAll}
                    aria-label="Select all songs"
                  />
                </th>
                <th
                  className="col-title sortable-th"
                  onClick={() => handleSort('title')}
                >
                  <div className="th-content">
                    <span>Title</span>
                    {renderSortIndicator('title')}
                  </div>
                </th>
                <th
                  className="col-artist sortable-th"
                  onClick={() => handleSort('artists')}
                >
                  <div className="th-content">
                    <span>Artists</span>
                    {renderSortIndicator('artists')}
                  </div>
                </th>
                <th
                  className="col-composer sortable-th"
                  onClick={() => handleSort('composers')}
                >
                  <div className="th-content">
                    <span>Composers</span>
                    {renderSortIndicator('composers')}
                  </div>
                </th>
                <th
                  className="col-year sortable-th"
                  onClick={() => handleSort('year')}
                >
                  <div className="th-content th-center">
                    <span>Year</span>
                    {renderSortIndicator('year')}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {processedSongs.map((song, idx) => {
                const titleToDisplay = song.title || song.filename || 'Untitled';
                const isSelected = selectedSongKeys.has(song.filename);

                const isEditingTitle =
                  editingCell &&
                  editingCell.filename === song.filename &&
                  editingCell.field === 'title';

                const isEditingArtists =
                  editingCell &&
                  editingCell.filename === song.filename &&
                  editingCell.field === 'artists';

                const isEditingComposers =
                  editingCell &&
                  editingCell.filename === song.filename &&
                  editingCell.field === 'composers';

                const isEditingYear =
                  editingCell &&
                  editingCell.filename === song.filename &&
                  editingCell.field === 'year';

                return (
                  <tr
                    key={song.filename || idx}
                    className={`song-row ${isSelected ? 'row-selected' : ''}`}
                  >
                    <td
                      className="col-checkbox"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleRow(song.filename);
                      }}
                    >
                      <input
                        type="checkbox"
                        className="custom-checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleRow(song.filename)}
                        aria-label={`Select ${titleToDisplay}`}
                      />
                    </td>

                    {/* Title Cell */}
                    <td
                      className="col-title editable-cell"
                      onClick={(e) => handleStartEditing(song, 'title', e)}
                    >
                      <div className={`cell-box ${isEditingTitle ? 'cell-editing' : ''}`}>
                        {isEditingTitle ? (
                          <input
                            ref={editInputRef}
                            type="text"
                            className="cell-editor-input input-title"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleSaveEdit()}
                            onKeyDown={handleEditKeyDown}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className="song-title-text">{titleToDisplay}</span>
                        )}
                      </div>
                    </td>

                    {/* Artists Cell */}
                    <td
                      className="col-artist editable-cell"
                      onClick={(e) => handleStartEditing(song, 'artists', e)}
                    >
                      <div className={`cell-box ${isEditingArtists ? 'cell-editing' : ''}`}>
                        {isEditingArtists ? (
                          <input
                            ref={editInputRef}
                            type="text"
                            className="cell-editor-input input-artist"
                            value={editValue}
                            placeholder="Artist 1 / Artist 2"
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleSaveEdit()}
                            onKeyDown={handleEditKeyDown}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : song.artists && song.artists.length > 0 ? (
                          <div className="text-line-list">
                            {song.artists.map((artist, aIdx) => (
                              <div key={aIdx} className="text-line-item artist-text">
                                {artist}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="cell-muted">—</span>
                        )}
                      </div>
                    </td>

                    {/* Composers Cell */}
                    <td
                      className="col-composer editable-cell"
                      onClick={(e) => handleStartEditing(song, 'composers', e)}
                    >
                      <div className={`cell-box ${isEditingComposers ? 'cell-editing' : ''}`}>
                        {isEditingComposers ? (
                          <input
                            ref={editInputRef}
                            type="text"
                            className="cell-editor-input input-composer"
                            value={editValue}
                            placeholder="Composer 1 / Composer 2"
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleSaveEdit()}
                            onKeyDown={handleEditKeyDown}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : song.composers && song.composers.length > 0 ? (
                          <div className="text-line-list">
                            {song.composers.map((composer, cIdx) => (
                              <div key={cIdx} className="text-line-item composer-text">
                                {composer}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="cell-muted">—</span>
                        )}
                      </div>
                    </td>

                    {/* Year Cell */}
                    <td
                      className="col-year editable-cell text-center"
                      onClick={(e) => handleStartEditing(song, 'year', e)}
                    >
                      <div className={`cell-box cell-box-center ${isEditingYear ? 'cell-editing' : ''}`}>
                        {isEditingYear ? (
                          <input
                            ref={editInputRef}
                            type="number"
                            className="cell-editor-input cell-editor-number"
                            value={editValue}
                            placeholder="YYYY"
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleSaveEdit()}
                            onKeyDown={handleEditKeyDown}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : song.year ? (
                          <span className="year-text">{song.year}</span>
                        ) : (
                          <span className="cell-muted">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Song Modal */}
      {isAddModalOpen && (
        <div className="modal-overlay" onClick={() => setIsAddModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Add New Song</h2>
              <button
                className="modal-close-btn"
                onClick={() => setIsAddModalOpen(false)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {formError && <div className="modal-error">{formError}</div>}

            <form onSubmit={handleCreateSong} className="modal-form">
              <div className="form-group">
                <label className="form-label">
                  Filename <span className="required-star">*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. MySong.mp3"
                  value={newSongForm.filename}
                  onChange={(e) =>
                    setNewSongForm({ ...newSongForm, filename: e.target.value })
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Title</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. My Song Title (defaults to filename)"
                  value={newSongForm.title}
                  onChange={(e) =>
                    setNewSongForm({ ...newSongForm, title: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label className="form-label">Artists (separated by '/')</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Artist 1 / Artist 2"
                  value={newSongForm.artists}
                  onChange={(e) =>
                    setNewSongForm({ ...newSongForm, artists: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label className="form-label">Composers (separated by '/')</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Composer 1 / Composer 2"
                  value={newSongForm.composers}
                  onChange={(e) =>
                    setNewSongForm({ ...newSongForm, composers: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label className="form-label">Year</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="e.g. 2024"
                  value={newSongForm.year}
                  onChange={(e) =>
                    setNewSongForm({ ...newSongForm, year: e.target.value })
                  }
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-cancel-btn"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="modal-submit-btn">
                  Add Song
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default SongList;
