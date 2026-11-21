// Local-only regression harness. Requires typescript, react and react-test-renderer.
// NODE_PATH=/path/to/dev/node_modules node --test src/context/TrackerContext.test.cjs
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const React = require('react')
const { act, create } = require('react-test-renderer')
global.IS_REACT_ACT_ENVIRONMENT = true
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }

test('GPS synchronization lifecycle and acknowledged writes', async (t) => {
  async function harness() {
    let watch, errorCallback, state, root, battery
    const timers = new Map(), calls = [], pending = [], listeners = new Map()
    let timerId = 0, now = 100000
    const api = Object.fromEntries(['writeLocation', 'addHistoryPoint', 'finishCheckin', 'pushEvent', 'updateShareLocation'].map(name => [name, (...args) => {
      calls.push({ name, args }); const next = pending.find(p => p.name === name && !p.used)
      if (next) { next.used = true; return next.promise }
      return Promise.resolve()
    }]))
    api.watchMyShares = (_, cb) => { cb([]); return () => {} }
    const navigator = { geolocation: { watchPosition: (cb, err) => { watch = cb; errorCallback = err; return 1 }, clearWatch() {} }, getBattery: () => battery ? battery.promise : Promise.resolve({ level: .5, charging: false }) }
    const events = { addEventListener: (name, cb) => listeners.set(name, cb), removeEventListener: name => listeners.delete(name) }
    const source = fs.readFileSync(__dirname + '/TrackerContext.tsx', 'utf8')
    const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }, reportDiagnostics: true })
    assert.equal((compiled.diagnostics || []).length, 0)
    const module = { exports: {} }
    const context = {
      module, exports: module.exports, React, navigator, console: { error() {} },
      Date: class extends Date { static now() { return now } },
      localStorage: { getItem: () => null, setItem() {} },
      document: { ...events, visibilityState: 'visible' }, window: events,
      setTimeout: (cb, delay) => { timers.set(++timerId, { cb, delay }); return timerId }, clearTimeout: id => timers.delete(id),
      require: name => name === 'react' ? React : name === '../lib/api' ? api : name === '../lib/format' ? { ms: Date.parse } : name === '../lib/geo' ? {
        metersBetween: (a, b) => Math.abs(a.lat - b.lat) * 111000,
        isInsidePlace: () => false, evaluateGeofences: () => ({ next: {}, transitions: [] }),
      } : require(name),
    }
    vm.runInNewContext(compiled.outputText, context)
    const { TrackerProvider, useTracker } = module.exports
    function Probe() { state = useTracker(); return null }
    let props = { profile: { uid: 'u1' }, circleId: 'c1', places: [], sharing: true, checkin: null }
    const render = () => React.createElement(TrackerProvider, props, React.createElement(Probe))
    await act(async () => { root = create(render()) })
    return {
      calls, timers, get state() { return state }, get watch() { return watch },
      pending(name) { const d = { name, ...deferred() }; pending.push(d); return d },
      battery() { battery = deferred(); return battery },
      async fix(lat = 1, accuracy = 10) { await act(async () => watch({ coords: { latitude: lat, longitude: 2, accuracy } })) },
      async update(next) { props = { ...props, ...next }; await act(async () => root.update(render())) },
      async settle(fn) { await act(async () => { fn(); await Promise.resolve() }) },
      async tick() { const [id, timer] = timers.entries().next().value; timers.delete(id); now += timer.delay; await act(async () => timer.cb()) },
      async gpsError() { await act(async () => errorCallback({ code: 2, PERMISSION_DENIED: 1 })) },
      async close() { await act(async () => root.unmount()) },
    }
  }

  await t.test('location/history failures retry without advancing timestamps or changing GPS status', async () => {
    const h = await harness(), loc = h.pending('writeLocation'), hist = h.pending('addHistoryPoint')
    await h.fix(); assert.equal(h.state.syncedAt, null); assert.equal(h.state.syncStatus, 'syncing')
    await h.settle(() => { loc.reject(new Error('offline')); hist.reject(new Error('offline')) })
    assert.equal(h.state.status, 'active'); assert.equal(h.state.syncStatus, 'error'); assert.equal(h.state.syncedAt, null)
    assert.equal([...h.timers.values()][0].delay, 5000)
    await h.fix(1.001); assert.equal(h.calls.filter(c => c.name === 'writeLocation').length, 1)
    await h.tick(); assert.equal(h.state.syncStatus, 'synced'); assert.equal(h.state.syncedAt, 105000)
    assert.equal(h.calls.filter(c => c.name === 'writeLocation')[1].args[2].lat, 1.001)
    assert.equal(h.calls.filter(c => c.name === 'addHistoryPoint').length, 2)
    await h.close()
  })
  await t.test('acknowledged location is not rewritten when only history fails', async () => {
    const h = await harness(), hist = h.pending('addHistoryPoint')
    await h.fix(); assert.equal(h.state.syncedAt, 100000)
    await h.settle(() => hist.reject(new Error('offline')))
    await h.tick()
    assert.equal(h.calls.filter(c => c.name === 'writeLocation').length, 1)
    assert.equal(h.calls.filter(c => c.name === 'addHistoryPoint').length, 2)
    assert.equal(h.state.syncedAt, 100000); assert.equal(h.state.syncStatus, 'synced')
    await h.close()
  })
  await t.test('repeated failures back off without GPS callbacks bypassing retry delay', async () => {
    const h = await harness()
    for (const delay of [5000, 10000, 20000, 40000, 60000, 60000]) {
      const loc = h.pending('writeLocation')
      if (h.calls.length === 0) await h.fix()
      else await h.tick()
      await h.settle(() => loc.reject(new Error('offline')))
      assert.equal([...h.timers.values()][0].delay, delay)
      const before = h.calls.length
      await h.fix(2)
      assert.equal(h.calls.length, before)
    }
    await h.close()
  })
  await t.test('pause during battery read blocks all writes and queued GPS callbacks', async () => {
    const h = await harness(), b = h.battery(), oldWatch = h.watch
    await h.fix(); await h.update({ sharing: false }); await h.settle(() => b.resolve({ level: 1, charging: true }))
    await h.settle(() => oldWatch({ coords: { latitude: 3, longitude: 4, accuracy: 10 } }))
    assert.equal(h.calls.length, 0); assert.equal(h.state.status, 'paused'); assert.equal(h.state.position, null)
    await h.close()
  })
  await t.test('unmount after an issued write prevents follow-up writes and timers', async () => {
    const h = await harness(), loc = h.pending('writeLocation')
    await h.fix(); await h.close(); await h.settle(() => loc.resolve())
    assert.deepEqual(h.calls.map(c => c.name), ['writeLocation']); assert.equal(h.timers.size, 0)
  })
  await t.test('circle change resets dedupe state and ignores old completion', async () => {
    const h = await harness(), old = h.pending('writeLocation')
    await h.fix(); await h.update({ circleId: 'c2' }); await h.fix()
    assert.equal(h.calls.filter(c => c.name === 'writeLocation').length, 2)
    assert.equal(h.calls.filter(c => c.name === 'writeLocation')[1].args[0], 'c2')
    await h.settle(() => old.resolve())
    assert.equal(h.calls.filter(c => c.name === 'addHistoryPoint').length, 1)
    await h.close()
  })
  await t.test('serialized writes coalesce GPS updates and GPS errors remain separate', async () => {
    const h = await harness(), loc = h.pending('writeLocation')
    await h.fix(); await h.fix(1.001); await h.fix(1.002)
    assert.equal(h.calls.filter(c => c.name === 'writeLocation').length, 1)
    await h.settle(() => loc.resolve()); await h.tick()
    assert.equal(h.calls.filter(c => c.name === 'writeLocation')[1].args[2].lat, 1.002)
    await h.gpsError(); assert.equal(h.state.status, 'error'); assert.equal(h.state.syncStatus, 'synced')
    await h.close()
  })
})
