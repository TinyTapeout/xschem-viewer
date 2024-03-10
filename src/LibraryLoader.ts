// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Tiny Tapeout LTD
// Author: Uri Shaked

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
    const response = await this.fetchContent(path);
    if (!response.ok) {
      throw new Error(`File not found: ${path}`);
    }
    const content = await response.text();
    this.cache.set(path, content);
    return content;
  }

  private async fetchContent(path: string) {
    if (path.toLowerCase().startsWith('https://')) {
      const url = new URL(path);
      console.log(url, url.hostname);
      if (url.hostname === 'github.com') {
        url.hostname = 'raw.githubusercontent.com';
        const pathParts = url.pathname.substring(1).split('/');
        if (pathParts[2] === 'blob') {
          pathParts.splice(2, 1);
          url.pathname = pathParts.join('/');
        }
        console.log(url);
        return await fetch(url.toString());
      } else {
        return await fetch(url);
      }
    }
    for (const library of this.libraries) {
      if (path.startsWith(library.path)) {
        const url = library.url + path;
        return await fetch(url);
      }
    }
    throw new Error(`File not found: ${path}`);
  }
}
