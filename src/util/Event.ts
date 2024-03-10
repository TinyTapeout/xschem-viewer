export type EventListener<T> = ((data: T) => void) | ((data: T) => Promise<void>);

export interface Event<T> {
  listen(listener: EventListener<T>): EventListener<T>;
  unlisten(listener: EventListener<T>): void;
}
