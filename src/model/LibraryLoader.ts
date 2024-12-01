// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Tiny Tapeout LTD
// Author: Uri Shaked

import { githubURLToRaw } from '../util/github';

export interface ILibraryDefinition {
  path: string;
  url: string;
}

export class LibraryLoader {
  private readonly cache = new Map<string, string>();
  readonly pathToUrl = new Map<string, string>();

  baseURL?: string;

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

  private async fetchContent(path: string): Promise<Response> {
    if (path.toLowerCase().startsWith('https://')) {
      const url = githubURLToRaw(path);
      return await fetch(url);
    }
    for (const library of this.libraries) {
      if (path.startsWith(library.path)) {
        const url = library.url + path;
        return await fetch(url);
      }
    }
    if (this.baseURL != null) {
      const url = new URL(path, githubURLToRaw(this.baseURL));
      const result = await fetch(url);
      if (result.ok) {
        this.pathToUrl.set(path, url.toString());
        return result;
      }

      // Try to look under the root of the github repo
      const altPath = url.pathname.split('/').slice(0, 4).join('/') + '/' + path;
      if (url.hostname === 'raw.githubusercontent.com' && url.pathname !== altPath) {
        url.pathname = altPath;
        const result = await fetch(url);
        if (result.ok) {
          this.pathToUrl.set(path, url.toString());
          return result;
        }
      }
    }
    if (!path.includes('/')) {
      // as a fallback, look under devices/
      return await this.fetchContent(`devices/${path}`);
    }
    throw new Error(`File not found: ${path}`);
  }
}
