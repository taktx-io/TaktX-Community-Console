# TaktX Community Console — Business Key & Tags Requirements

## Goal

Add support for displaying and basic filtering of process instance `businessKey` and `tags` metadata in the Community Console.

The goal is to provide practical operational visibility without introducing advanced enterprise-grade querying or indexing features.

This functionality should feel:

* useful
* production-capable
* lightweight
* operationally simple

Advanced search/intelligence capabilities remain reserved for Premium/Ops.

---

# Scope

This work applies to:

* process instance list views
* process instance detail views
* basic filtering/search functionality
* websocket/live updates where applicable

This work does NOT include:

* advanced search
* saved views
* variable querying
* multi-tag query logic
* cross-namespace querying
* analytics/intelligence features

---

# 1. Process Instance Detail View

Display:

* `businessKey`
* `tags`

Requirements:

* clearly visible in the process instance metadata section
* hide section gracefully if values are absent
* tags displayed as compact labels/chips/badges

Example:

```text id="zffg6d"
Business Key: ORDER-48192
Tags: vip, eu-west, fraud-review
```

---

# 2. Process Instance List View

Add optional columns:

* `businessKey`
* `tags`

Requirements:

* configurable visibility if table already supports column toggling
* truncate long values gracefully
* tags rendered compactly
* avoid excessive row height growth

---

# 3. Exact Business Key Search

Support exact business-key lookup/filtering.

Requirements:

* exact match only
* case-sensitive matching
* no wildcard support
* no fuzzy search
* no contains/prefix logic

Example:

```text id="hnpbqr"
businessKey == "ORDER-48192"
```

This feature is intentionally lightweight and operationally focused.

Advanced querying remains Premium/Ops functionality.

---

# 4. Basic Tag Filtering

Support filtering by a single tag.

Requirements:

* exact tag match only
* one tag at a time
* no boolean expressions
* no AND/OR combinations
* no wildcard matching

Example:

```text id="6r11mn"
tag == "vip"
```

Out of scope:

* multiple tag combinations
* negative filters
* advanced expressions

---

# 5. Existing Filters

Business-key and tag filtering must integrate cleanly with existing filters:

* state
* start date
* end date
* incidents
* process definition/version

Combined filtering should remain lightweight and performant.

---

# 6. Live Updates

Where live instance updates are already supported:

* ensure business-key/tag fields are displayed correctly
* avoid unnecessary re-rendering/churn
* do not require repeated transmission of immutable metadata if already cached locally

The console should assume:

* businessKey and tags are immutable after process start

---

# 7. Performance Expectations

Community Console implementation should remain lightweight.

Avoid:

* heavy indexing
* complex client-side query engines
* historical analytics behavior
* large-scale aggregation logic

The implementation should work efficiently with:

* in-memory ingesters
* lightweight local filtering
* moderate instance counts

---

# 8. Non-Goals

Out of scope:

* advanced query builder
* variable filtering/querying
* fuzzy search
* contains/prefix matching
* saved searches/views
* dashboards
* analytics
* multi-tag boolean logic
* cross-namespace querying
* DLQ operational workflows

These capabilities belong to Premium/Ops.

---

# 9. Product Positioning Intent

Community Console should support:

```text id="pxyz07"
"What is running?"
"What failed?"
"Can I find the process instance I care about?"
```

It should NOT attempt to become:

* a large-scale operational intelligence platform
* an enterprise search/indexing solution
* an analytics product

Those concerns belong to Premium/Ops.
