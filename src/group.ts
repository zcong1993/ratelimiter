export type NewFunc<T> = () => T

export class Group<T = any, K = any> {
  private map = new Map<K, T>()
  private newFunc: NewFunc<T>

  constructor(newFunc: NewFunc<T>) {
    this.newFunc = newFunc
  }

  get(key: K): T {
    if (!this.map.has(key)) {
      const res = this.newFunc()
      this.map.set(key, res)
      return res
    }
    return this.map.get(key)
  }

  reset() {
    this.map.clear()
  }
}
