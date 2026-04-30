import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __testing, verifyBoardAuth } from "../auth";

const { parseBearer, constantTimeStringEquals } = __testing;

describe("parseBearer", () => {
    it("extracts a well-formed token", () => {
        expect(parseBearer("Bearer abc123")).toBe("abc123");
        expect(parseBearer("bearer xyz")).toBe("xyz"); // case-insensitive
    });

    it("returns null on missing/empty/malformed input", () => {
        expect(parseBearer(null)).toBeNull();
        expect(parseBearer("")).toBeNull();
        expect(parseBearer("Bearer ")).toBeNull();
        expect(parseBearer("Token abc")).toBeNull();
        expect(parseBearer("abc")).toBeNull();
    });
});

describe("constantTimeStringEquals", () => {
    it("returns true for equal strings", () => {
        expect(constantTimeStringEquals("abc123", "abc123")).toBe(true);
        expect(constantTimeStringEquals("", "")).toBe(true);
    });
    it("returns false on content mismatch (same length)", () => {
        expect(constantTimeStringEquals("abc123", "abc124")).toBe(false);
    });
    it("returns false on length mismatch (no leak)", () => {
        expect(constantTimeStringEquals("abc", "abc123")).toBe(false);
        expect(constantTimeStringEquals("abc123", "abc")).toBe(false);
    });
});

describe("verifyBoardAuth", () => {
    let prevKey: string | undefined;
    beforeEach(() => {
        prevKey = process.env.BOARD_API_KEY;
    });
    afterEach(() => {
        if (prevKey === undefined) delete process.env.BOARD_API_KEY;
        else process.env.BOARD_API_KEY = prevKey;
    });

    it("denies all when env not set", () => {
        delete process.env.BOARD_API_KEY;
        expect(verifyBoardAuth("Bearer anything")).toBe("denied");
    });

    it("denies on missing header", () => {
        process.env.BOARD_API_KEY = "expected-key";
        expect(verifyBoardAuth(null)).toBe("denied");
    });

    it("denies on wrong key", () => {
        process.env.BOARD_API_KEY = "expected-key";
        expect(verifyBoardAuth("Bearer wrong-key")).toBe("denied");
    });

    it("approves on correct Bearer", () => {
        process.env.BOARD_API_KEY = "expected-key-32-chars-long-12345";
        expect(verifyBoardAuth("Bearer expected-key-32-chars-long-12345")).toBe("ok");
    });

    it("denies on prefix that matches partially", () => {
        process.env.BOARD_API_KEY = "expected-key-12345";
        expect(verifyBoardAuth("Bearer expected-key")).toBe("denied");
    });
});
