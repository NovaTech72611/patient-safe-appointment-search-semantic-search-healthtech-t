import assert from "node:assert/strict";
import test from "node:test";
import { findPatientSafeNotices, type SearchProvider } from "../src/patient_safe_search.js";

test("returns only patient-safe notices approved for the requested channel", async () => {
  const provider: SearchProvider = {
    async query() {
      return [
        {
          id: "internal-note",
          score: 0.98,
          metadata: { title: "Staff note", workflow: "reschedule", patient_safe: false, allowed_channels: ["sms"], body: "Call queue detail" },
        },
        {
          id: "portal-only",
          score: 0.95,
          metadata: { title: "Portal notice", workflow: "cancellation", patient_safe: true, allowed_channels: ["portal"], body: "Review your portal" },
        },
        {
          id: "safe-sms",
          score: 0.91,
          metadata: { title: "Time changed", workflow: "reschedule", patient_safe: true, allowed_channels: ["sms", "portal"], body: "Your appointment time changed" },
        },
      ];
    },
  };

  const notices = await findPatientSafeNotices(provider, { query: "my appointment moved", channel: "sms", limit: 2 });

  assert.deepEqual(notices, [{
    content_id: "safe-sms",
    title: "Time changed",
    body: "Your appointment time changed",
    channel: "sms",
    workflow: "reschedule",
  }]);
});
