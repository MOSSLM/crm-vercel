import { normalizePublishedSubdomainInput } from "../publish-subdomain";

describe("normalizePublishedSubdomainInput", () => {
  it("accepts a bare label", () => {
    expect(normalizePublishedSubdomainInput("technichaudfroid", "samadigitalstudio.fr")).toBe("technichaudfroid");
  });

  it("accepts a full demo URL on the site domain", () => {
    expect(normalizePublishedSubdomainInput("https://technichaudfroid.samadigitalstudio.fr/contact", "samadigitalstudio.fr")).toBe("technichaudfroid");
  });

  it("rejects an external custom domain", () => {
    expect(normalizePublishedSubdomainInput("https://technichaudfroid.fr", "samadigitalstudio.fr")).toBeNull();
  });
});
