(() => {
  'use strict';
  const fail = code => Object.assign(new Error(code), { code });

  function createIntake({ send, notices, makeId = () => crypto.randomUUID() }) {
    const { digest, normalize, RECEIPT, UUID } = globalThis.SolqPortal;
    let pending = null;
    let busy = false;
    let confirmed = false;

    async function submit(draft) {
      if (busy) throw fail('IN_FLIGHT');
      busy = true;
      try {
        const normalized = normalize(draft, notices);
        const fingerprint = await digest(JSON.stringify(normalized));
        const requestId = pending?.id ?? makeId();
        if (pending && pending.fingerprint !== fingerprint) throw fail('REQUEST_CONFLICT');
        pending = { id: requestId, fingerprint };
        confirmed = false;
        let result;
        try {
          result = await send('submit', { requestId, draft: normalized });
        } catch {
          throw fail('SAVE_UNCERTAIN');
        }
        if (result?.status >= 400 && result.status < 500 && typeof result.error === 'string') throw fail(result.error);
        const data = result?.data;
        if (result?.status !== 200 || data?.saved !== true || data.requestId !== requestId ||
            data.fingerprint !== fingerprint || typeof data.applicationId !== 'string' ||
            !UUID.test(data.applicationId) || typeof data.receiptNumber !== 'string' ||
            !RECEIPT.test(data.receiptNumber) ||
            !data.receiptNumber.endsWith('-' + data.applicationId.slice(0, 8).toUpperCase())) throw fail('SAVE_UNCERTAIN');
        confirmed = true;
        return data;
      } finally {
        busy = false;
      }
    }

    function beginNew() {
      if (busy || !confirmed) throw fail('SAVE_UNCERTAIN');
      confirmed = false;
      pending = null;
    }

    return Object.freeze({ submit, beginNew });
  }
  globalThis.SolqPortalClient = Object.freeze({ createIntake });
})();
