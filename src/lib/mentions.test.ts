import { describe, it, expect } from "vitest";
import { parseMentions } from "./mentions";

const agents = ["alice@travelgenix.io", "bob@travelgenix.io", "carol@agendas.group"];

describe("parseMentions", () => {
  it("matches a bare @local-part", () => {
    expect(parseMentions("can you take this @alice?", agents)).toEqual(["alice@travelgenix.io"]);
  });

  it("matches an @-prefixed full email", () => {
    expect(parseMentions("over to @bob@travelgenix.io", agents)).toEqual(["bob@travelgenix.io"]);
  });

  it("matches a bare full email", () => {
    expect(parseMentions("ask carol@agendas.group please", agents)).toEqual(["carol@agendas.group"]);
  });

  it("de-duplicates repeated mentions and finds multiple agents", () => {
    expect(parseMentions("@alice and @alice and @bob, thoughts?", agents).sort()).toEqual(
      ["alice@travelgenix.io", "bob@travelgenix.io"].sort(),
    );
  });

  it("ignores prose with no mentions and unrelated emails", () => {
    expect(parseMentions("no mentions here", agents)).toEqual([]);
    expect(parseMentions("forward to sales@othercorp.com", agents)).toEqual([]);
  });

  it("does not match @alicia when only alice is an agent", () => {
    expect(parseMentions("hey @alicia can you look", agents)).toEqual([]);
  });
});
