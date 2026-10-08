// Shared drag-handle glyph (also used by the Embeddings provider list, so the
// two reorder surfaces look identical). Kept in its own module: a JSX element
// export next to model-table's components would break Fast Refresh for that
// file.
export const dragDots = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
  </svg>
)
