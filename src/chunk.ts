export interface Chunk {
  content: string; // The main diff content
  changes: Array<{
    ln?: number; // Original line number (optional)
    ln2?: number; // New line number (optional)
    content: string; // The actual line change content
  }>;
}
