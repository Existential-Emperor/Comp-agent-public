---
name: research-modes
description: Selector visibility — Use Selectors vs Chat Directly toggle. Selectors hide for general queries, page transitions use AnimatedPage with AnimatePresence
type: feature
---
Users switch between research modes via a pill-shaped segmented control ("Use Selectors" / "Chat Directly"). The toggle hides once a conversation has started.

Selector row visibility rule:
`showSelectors = !directChatMode && (!hasStarted || !!category)`

This ensures that once a general/direct chat conversation is in progress without a selected Charter, the Charters / Product Areas / Competitors selectors are hidden — keeping the composer minimal for general queries.

Page transitions:
- All routes are wrapped in <AnimatedPage> via an AnimatePresence (mode="wait") in src/App.tsx.
- AnimatedPage applies a smooth fade + slight y-drift + scale + blur using cubic ease [0.22, 1, 0.36, 1] on enter and [0.4, 0, 1, 1] on exit.
- The Suspense PageLoader uses a multi-ring rotating Sentinel spinner with breathing "SENTINEL" wordmark.
