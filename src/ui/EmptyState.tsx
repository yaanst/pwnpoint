import type { ComponentChildren } from 'preact';

/** What a page shows when there is nothing yet: what it is for and how to start. */
export function EmptyState({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <div class="empty-state">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
