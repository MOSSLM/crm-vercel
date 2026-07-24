import { toE164, toDialDigits, normalizePhone, phonesMatch } from "../phone";

describe("toE164 (dial-string normalisation)", () => {
  it("turns a French national number into +33…", () => {
    expect(toE164("0646042876")).toBe("+33646042876");
    expect(toE164("06 46 04 28 76")).toBe("+33646042876");
    expect(toE164("03 92 28 03 07")).toBe("+33392280307");
  });

  it("keeps numbers that are already international", () => {
    expect(toE164("+33646042876")).toBe("+33646042876");
    expect(toE164("+33 6 46 04 28 76")).toBe("+33646042876");
    expect(toE164("0033646042876")).toBe("+33646042876");
    expect(toE164("33646042876")).toBe("+33646042876");
  });

  it("supports a non-French default country", () => {
    expect(toE164("06123456789", "44")).toBe("+446123456789");
  });

  it("dials internal PBX extensions verbatim", () => {
    expect(toE164("100")).toBe("100");
    expect(toE164("6001")).toBe("6001");
  });

  it("returns empty for blank input", () => {
    expect(toE164("")).toBe("");
    expect(toE164(null)).toBe("");
    expect(toE164(undefined)).toBe("");
  });
});

describe("toDialDigits (Zadarma web-phone form)", () => {
  it("drops the leading + for the widget", () => {
    expect(toDialDigits("0646042876")).toBe("33646042876");
    expect(toDialDigits("+33646042876")).toBe("33646042876");
  });

  it("passes internal extensions through", () => {
    expect(toDialDigits("100")).toBe("100");
  });
});

describe("existing matching helpers still work", () => {
  it("normalizePhone keeps a leading +", () => {
    expect(normalizePhone("+33 6 46 04 28 76")).toBe("+33646042876");
    expect(normalizePhone("06 46 04 28 76")).toBe("0646042876");
  });

  it("phonesMatch pairs national and international forms", () => {
    expect(phonesMatch("0646042876", "+33646042876")).toBe(true);
    expect(phonesMatch("0646042876", "0102030405")).toBe(false);
  });
});
