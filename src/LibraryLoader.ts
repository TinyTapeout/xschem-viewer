export interface ILibraryDefinition {
  path: string;
  url: string;
}

export class LibraryLoader {
  cache = new Map<string, string>();

  constructor(readonly libraries: ILibraryDefinition[]) {}

  async fileExists(path: string) {
    try {
      await this.load(path);
      return true;
    } catch {
      return false;
    }
  }

  async load(path: string) {
    const cacheEntry = this.cache.get(path);
    if (cacheEntry != null) {
      return cacheEntry;
    }
    for (const library of this.libraries) {
      if (path.startsWith(library.path)) {
        const url = library.url + path;
        const response = await fetch(url);
        if (response.ok) {
          const content = await response.text();
          this.cache.set(path, content);
          return content;
        }
      }
    }

    throw new Error(`File not found: ${path}`);
  }
}
