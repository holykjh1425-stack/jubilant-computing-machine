const fixtureTransports = new WeakMap();
const db = 'solq_dev02_synthetic';
const gateway = 'http://127.0.0.1:54321';
const scenarios = Object.freeze(['submit_case', 'case_view', 'case_action', 'read_object', 'write_object']);

function reject(code) {
  throw Object.assign(new Error(code), { code });
}

// Pair these in-process functions in tests. No value is read from process.env or an external socket.
export function createFixtureTransport({ auth, postgrest, postgres }) {
  if (typeof auth?.verify !== 'function' || typeof postgrest?.invoke !== 'function' ||
      typeof postgres?.transaction !== 'function') reject('INVALID_FIXTURE_TRANSPORT');
  const lease = Object.freeze({});
  fixtureTransports.set(lease, { auth, postgrest, postgres });
  return lease;
}

export function createPortalAdapter({ mode = 'off', database = db, url = gateway, transport } = {}) {
  if (mode !== 'off' && mode !== 'fixture') reject('LIVE_TRANSPORT_UNAVAILABLE');
  if (database !== db || url !== gateway) reject('INVALID_ISOLATION_TARGET');
  if (mode === 'off') {
    return Object.freeze({ mode, async request() { reject('ADAPTER_DISABLED'); } });
  }
  if (!fixtureTransports.has(transport)) reject('INVALID_FIXTURE_TRANSPORT');
  const { auth, postgrest, postgres } = fixtureTransports.get(transport);
  return Object.freeze({
    mode,
    async request({ route, session, body } = {}) {
      if (!scenarios.includes(route)) reject('ROUTE_NOT_ALLOWED');
      const identity = await auth.verify(session);
      return postgres.transaction(() => postgrest.invoke(route, identity, body ?? {}));
    }
  });
}
