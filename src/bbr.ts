import { RollingCounter, hrtime } from '@zcong/rolling-policy'
import { Cpuproc, CpuStat } from './cpu'

export class ErrorLimitExceed extends Error {}

export interface DoneInfo {
  success: boolean
}

export type CallbackFunc = (doneInfo: DoneInfo) => void

export interface Config {
  window?: number // ms
  winBucket?: number
  cpuThreshold?: number
  cupProc?: Cpuproc
}

export const defaultConfig: Config = {
  window: 5000,
  winBucket: 50,
  cpuThreshold: 80
}

const ONE_SECOND_NANO = 1e9
const INIT_HRTIME = hrtime()

export const sinceHrtime = (since: number): number => {
  return hrtime() - since
}

export const sum = (nums: number[]): number =>
  nums.reduce((prev: number, cur: number) => prev + cur, 0)

export class Bbr {
  private readonly config: Config
  private readonly cpu: Cpuproc
  private passState: RollingCounter
  private rtStat: RollingCounter
  private inFlight: number = 0
  private winBucketPerSec: number
  private prevDrop: number
  private prevDropHit: boolean
  private rawMaxPass: number
  private rawMinRt: number

  constructor(cfg?: Config) {
    if (!cfg) {
      this.config = defaultConfig
    } else {
      this.config = cfg
    }

    if (!this.config.cupProc) {
      this.cpu = new Cpuproc(new CpuStat())
    }

    const size = this.config.winBucket
    const bucketDuration = this.config.window / size

    this.passState = new RollingCounter({ size, bucketDuration })
    this.rtStat = new RollingCounter({ size, bucketDuration })
    this.winBucketPerSec = 1000 / bucketDuration
  }

  allow(): CallbackFunc {
    if (this.shouldDrop()) {
      throw new ErrorLimitExceed()
    }

    this.inFlight += 1
    const startTime = sinceHrtime(INIT_HRTIME)
    return (doneInfo: DoneInfo) => {
      const rt = sinceHrtime(INIT_HRTIME) - startTime
      this.rtStat.add(rt)
      this.inFlight -= 1
      if (doneInfo.success) {
        this.passState.add(1)
      }
    }
  }

  get stat() {
    return {
      cpu: this.cpu.stat(),
      inFlight: this.inFlight,
      minRt: this.minRt(),
      maxPass: this.maxPass(),
      maxInFlight: this.maxFlight()
    }
  }

  private shouldDrop(): boolean {
    if (this.cpu.stat() < this.config.cpuThreshold) {
      if (this.prevDrop === 0) {
        return false
      }

      if (sinceHrtime(INIT_HRTIME) - this.prevDrop <= ONE_SECOND_NANO) {
        if (!this.prevDropHit) {
          this.prevDropHit = true
        }
        return this.inFlight > 1 && this.inFlight > this.maxFlight()
      }

      this.prevDrop = 0
      return false
    }

    const drop = this.inFlight > 1 && this.inFlight > this.maxFlight()
    if (drop) {
      if (this.prevDrop !== 0) {
        return drop
      }

      this.prevDrop = sinceHrtime(INIT_HRTIME)
    }

    return drop
  }

  private maxFlight(): number {
    return Math.floor(
      (this.maxPass() * this.minRt() * this.winBucketPerSec) / 1000 + 0.5
    )
  }

  private maxPass(): number {
    if (this.rawMaxPass > 0 && this.passState.timespan() < 1) {
      return this.rawMaxPass
    }

    let rawMaxPass = 1
    const currentPoints = this.passState.currentPoints()
    if (currentPoints.length > this.config.winBucket - 1) {
      currentPoints.pop()
    }
    for (const points of currentPoints) {
      rawMaxPass = Math.max(rawMaxPass, sum(points))
    }

    this.rawMaxPass = rawMaxPass
    return rawMaxPass
  }

  private minRt(): number {
    if (this.rawMinRt > 0 && this.rtStat.timespan() < 1) {
      return this.rawMinRt
    }

    let rawMinRt = Number.MAX_SAFE_INTEGER
    const currentBuckets = this.rtStat.currentBuckets()
    if (currentBuckets.length > this.config.winBucket - 1) {
      currentBuckets.pop()
    }
    for (const bucket of currentBuckets) {
      if (bucket.getCount() === 0) {
        continue
      }
      rawMinRt = Math.min(rawMinRt, sum(bucket.getPoints()) / bucket.getCount())
    }

    if (rawMinRt <= 0) {
      rawMinRt = 1
    }

    this.rawMinRt = Math.ceil(rawMinRt)

    return this.rawMinRt
  }
}

// const bbr = new Bbr({
//   cpuThreshold: 80,
//   window: 1000,
//   winBucket: 10,
// })

// const run = async () => {
//   let publicB = bbr as any
//   const d = 100
//   let j = 0
//   for (let i = 0; i <= 10; i++) {
//     j += i * 100
//     publicB.passState.add(i * 100)
//     await sleepMs(d)
//   }

//   console.log(publicB.maxPass(), j)
// }

// const run = async () => {
//   const d = 100
//   bbr.rtStat = new RollingCounter({ size: 10, bucketDuration: d})
//   let jj = 0
//   for (let i = 0; i < 10; i++) {
//     for (let j = i*10 + 1; j <= i*10+10; j++) {
//       jj += j
//       bbr.rtStat.add(j)
//     }
//     if (i !== 9) {
//       await sleepMs(d)
//     }
//   }

//   console.log(bbr.stat, jj)
// }

// const run = async () => {
//   const d = 100
//   for (let i = 0; i < 10; i++) {
//     bbr.passState.add((i + 2) * 100)
//     for (let j = i*10 + 1; j <= i*10+10; j++) {
//       bbr.rtStat.add(j)
//     }
//     if (i !== 9) {
//       await sleepMs(d)
//     }
//   }

//   console.log(bbr.maxFlight())
// }

// run()

// setInterval(() => console.log('cpu: ', bbr.stat), 100)

// const afterN = async (fn: Function, n: number) => {
//   await sleepMs(n)
//   return fn()
// }

// let i = 0
// let drop = 0
// const fns = () => Array(30000)
//   .fill(null)
//   .map((_, i) => {
//     const rd = Math.floor(Math.random() * 1000)
//     try {
//       const cb = bbr.allow()
//       return afterN(() => {
//         cb({ success: true })
//         // console.log(i, rd, bbr.stat)
//       }, rd)
//     } catch (err) {
//       console.log(err)
//       drop++
//     }
//     return () => {}
//   })

// sleepMs(5000)
//   .then(() => Promise.all(fns()))
//   .then(() => {
//     console.log('done, drop: ', drop, bbr.iii)
//     process.exit(0)
//   })
