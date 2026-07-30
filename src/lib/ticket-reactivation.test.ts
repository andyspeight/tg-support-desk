import { describe, expect, it } from "vitest";
import { customerReplyPatch } from "./ticket-reactivation";

describe("customerReplyPatch", () => {
  it("clears 'waiting on customer' — they have now replied (#8144)", () => {
    // The reported bug: this must not depend on the AI loop running.
    expect(customerReplyPatch({ status: "waiting_on_customer" })).toEqual({ status: "new" });
  });

  it("reopens a finished ticket and clears its resolution", () => {
    expect(customerReplyPatch({ status: "resolved" })).toEqual({
      status: "new",
      ai_resolved: false,
      resolved_at: null,
    });
    expect(customerReplyPatch({ status: "closed" })).toEqual({
      status: "new",
      ai_resolved: false,
      resolved_at: null,
    });
  });

  it("leaves already-active statuses alone", () => {
    for (const status of ["new", "ai_working", "escalated", "needs_review"] as const) {
      expect(customerReplyPatch({ status })).toBeNull();
    }
  });

  it("does not override a status a human deliberately parked", () => {
    // We're waiting on ourselves or a third party — a customer chasing doesn't
    // end that wait, and these are already in the open queues.
    for (const status of ["pending", "awaiting_supplier", "awaiting_custom_dev"] as const) {
      expect(customerReplyPatch({ status })).toBeNull();
    }
  });

  it("keeps the spam gate closed", () => {
    expect(customerReplyPatch({ status: "awaiting_approval" })).toBeNull();
  });

  it("lifts a snooze so the reply can't stay hidden from the open queues", () => {
    expect(customerReplyPatch({ status: "waiting_on_customer", snoozed_until: "2030-01-01T00:00:00Z" })).toEqual({
      status: "new",
      snoozed_until: null,
    });
    expect(customerReplyPatch({ status: "resolved", snoozed_until: "2030-01-01T00:00:00Z" })).toEqual({
      status: "new",
      ai_resolved: false,
      resolved_at: null,
      snoozed_until: null,
    });
  });

  it("un-snoozes a parked ticket without changing its status", () => {
    expect(customerReplyPatch({ status: "awaiting_supplier", snoozed_until: "2030-01-01T00:00:00Z" })).toEqual({
      snoozed_until: null,
    });
  });

  it("writes nothing when the state is already correct", () => {
    expect(customerReplyPatch({ status: "new", snoozed_until: null })).toBeNull();
  });
});
