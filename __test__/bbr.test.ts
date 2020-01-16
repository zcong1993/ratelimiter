import { sleepMs, RollingCounter } from '@zcong/rolling-policy'
import { Bbr } from '../src/bbr'

const createBbr = () => {
  const bbr = new Bbr({
    cpuThreshold: 80,
    window: 1000,
    winBucket: 10
  })

  return [bbr as any, () => bbr.destroy()]
}

const createBbrWithCpu = (cpu: any): any => {
  const bbr: any = new Bbr({
    cpuThreshold: 80,
    window: 1000,
    winBucket: 10
  })
  bbr.destroy()
  bbr.cpu = cpu
  return bbr
}

const mockCpu = () => {
  class MockCpuproc {
    cpu: number = 0
    stat() {
      return this.cpu
    }
  }

  return new MockCpuproc()
}

const afterN = async (fn: Function, n: number) => {
  await sleepMs(n)
  return fn()
}

it('maxPass should works well', async () => {
  const [publicB, destroy] = createBbr()
  const d = 100
  for (let i = 0; i <= 10; i++) {
    publicB.passState.add(i * 100)
    await sleepMs(d)
  }

  expect(publicB.maxPass()).toBe(1000)

  destroy()
})

it('minRt should works well', async () => {
  const [publicB, destroy] = createBbr()
  const d = 100
  publicB.rtStat = new RollingCounter({ size: 10, bucketDuration: d })
  for (let i = 0; i < 10; i++) {
    for (let j = i * 10 + 1; j <= i * 10 + 10; j++) {
      publicB.rtStat.add(j)
    }
    if (i !== 9) {
      await sleepMs(d)
    }
  }

  expect(publicB.minRt()).toBe(6)

  destroy()
})

it('maxQps should works well', async () => {
  const [publicB, destroy] = createBbr()
  const d = 100
  for (let i = 0; i < 10; i++) {
    publicB.passState.add((i + 2) * 100)
    for (let j = i * 10 + 1; j <= i * 10 + 10; j++) {
      publicB.rtStat.add(j)
    }
    if (i !== 9) {
      await sleepMs(d)
    }
  }
  expect(publicB.maxFlight()).toBe(60)

  destroy()
})

it('should drop', async () => {
  const cpu = mockCpu()
  const publicB = createBbrWithCpu(cpu)
  const d = 100

  for (let i = 0; i < 10; i++) {
    publicB.passState.add((i + 1) * 100)
    for (let j = i * 10 + 1; j <= i * 10 + 10; j++) {
      publicB.rtStat.add(j)
    }
    if (i !== 9) {
      await sleepMs(d)
    }
  }

  // cpu >=  80, inflight < maxQps
  cpu.cpu = 80
  publicB.inFlight = 50
  expect(publicB.shouldDrop()).toBeFalsy()

  // cpu >=  80, inflight > maxQps
  cpu.cpu = 80
  publicB.inFlight = 80
  expect(publicB.shouldDrop()).toBeTruthy()

  // cpu < 80, inflight > maxQps, cold duration
  cpu.cpu = 70
  publicB.inFlight = 80
  expect(publicB.shouldDrop()).toBeTruthy()

  // cpu < 80, inflight > maxQps
  await sleepMs(2000)
  cpu.cpu = 70
  publicB.inFlight = 80
  expect(publicB.shouldDrop()).toBeFalsy()
})

it('bbr should works well', async () => {
  const bbr = new Bbr({
    window: 5000,
    winBucket: 50,
    cpuThreshold: 10
  })

  let drop = 0

  const createFn = (n: number) => {
    return async () => {
      for (let i = 0; i < n; i++) {
        const rd = Math.floor(Math.random() * 100)
        try {
          const cb = bbr.allow()
          await sleepMs(rd)
          cb({ success: true })
        } catch (err) {
          drop++
        }
      }
    }
  }

  const fns = () =>
    Array(100)
      .fill(null)
      .map(() => createFn(300)())

  await Promise.all(fns())
  console.log(`drop: ${drop}`)
  bbr.destroy()
}, 20000)
