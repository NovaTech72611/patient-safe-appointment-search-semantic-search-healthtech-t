import { InfraiHealthSearch, type ContentMetadata } from "./infrai_health_search.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before indexing content");

const documents: Array<{ id: string; text: string; metadata: ContentMetadata }> = [
  {
    id: "appointment-reschedule-confirmation-v1",
    text: "Confirm that a patient appointment was moved to a new date and time.",
    metadata: {
      title: "Reschedule confirmation",
      workflow: "reschedule",
      patient_safe: true,
      allowed_channels: ["sms", "email", "portal"],
      body: "Your appointment has been rescheduled. Check your patient portal for the updated date and time.",
    },
  },
  {
    id: "appointment-cancellation-portal-v1",
    text: "Notify a patient that an appointment was cancelled and explain how to book again.",
    metadata: {
      title: "Cancellation notice",
      workflow: "cancellation",
      patient_safe: true,
      allowed_channels: ["email", "portal"],
      body: "Your appointment was cancelled. Use the patient portal or call the clinic to choose another time.",
    },
  },
];

const search = new InfraiHealthSearch(apiKey, "appointment-operations");
const dimension = (await search.embed("appointment workflow")).length;
await search.createCollection(dimension);
await search.upsert(documents);
console.log(`Indexed ${documents.length} appointment notices.`);
