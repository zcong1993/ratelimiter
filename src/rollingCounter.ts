import * as debug from 'debug'

const debugLogger = debug('rollingCounter')

interface C {
  val: number
  time: number
  date?: Date
}

interface RollingCounterOpts {
  windowNano?: number
  gcInterval?: number
}

const ONE_SECOND_NANO = 1e9

const nano = (): number => {
  const hr = process.hrtime()
  return hr[0] * 1000000000 + hr[1]
}

const defaultOpts: RollingCounterOpts = {
  windowNano: ONE_SECOND_NANO,
  gcInterval: 5000
}

export class RollingCounter {
  private store: C[] = []
  private opt: RollingCounterOpts
  private gcTimer: NodeJS.Timeout

  constructor(option: RollingCounterOpts = {}) {
    this.opt = {
      ...defaultOpts,
      ...option
    }
    this.gcTimer = setInterval(() => this.gc(), this.opt.gcInterval)
  }

  add(val: number, time: number = nano()) {
    this.store.push({
      val,
      time
    })
  }

  reduceTotal(start?: number): number {
    const s = start || this.windowStartNano()
    this.gc(s)
    return this.store.reduce((prev, acc) => acc.val + prev, 0)
  }

  gc(start?: number) {
    const s = start || this.windowStartNano()
    const i = this.store.findIndex(c => c.time >= s)
    if (i < 0) {
      this.store = []
    } else {
      this.store = this.store.slice(i)
    }
    debugLogger(`gc, i: ${i}, store size: ${this.store.length}`)
  }

  destroy() {
    clearInterval(this.gcTimer)
  }

  stats() {
    return {
      size: this.store.length
    }
  }

  private windowStartNano() {
    return nano() - this.opt.windowNano
  }
}
