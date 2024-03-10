// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Tiny Tapeout LTD
// Author: Uri Shaked

import type { Event, EventListener } from './Event';

class EventImpl<T> implements Event<T> {
  private readonly _listeners = new Set<EventListener<T>>();

  listen(listener: EventListener<T>) {
    this._listeners.add(listener);
    return listener;
  }

  unlisten(listener: EventListener<T>) {
    this._listeners.delete(listener);
  }

  get listeners() {
    return this._listeners;
  }
}

export class EventEmitter<T> {
  readonly _event = new EventImpl<T>();

  fire(data: T) {
    for (const listener of this._event.listeners) {
      void listener(data);
    }
  }

  get event() {
    return this._event;
  }
}
