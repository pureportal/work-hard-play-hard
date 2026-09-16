export class ImageCache<T> {
  private readonly entries = new Map<string, { value: T; bytes: number }>();
  private readonly pending = new Map<string, Promise<T>>();
  private bytes = 0;

  constructor(private readonly maximumBytes: number, private readonly sizeOf: (value: T) => number) {}

  get(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return Promise.resolve(cached.value);
    }
    const pending = this.pending.get(key);
    if (pending) return pending;
    const request = Promise.resolve().then(load).then(value => {
      this.pending.delete(key);
      const bytes = this.sizeOf(value);
      if (bytes <= this.maximumBytes) {
        this.entries.set(key, { value, bytes });
        this.bytes += bytes;
        while (this.bytes > this.maximumBytes || this.entries.size > 128) {
          const oldest = this.entries.keys().next().value!;
          this.bytes -= this.entries.get(oldest)!.bytes;
          this.entries.delete(oldest);
        }
      }
      return value;
    }, error => {
      this.pending.delete(key);
      throw error;
    });
    this.pending.set(key, request);
    return request;
  }
}
