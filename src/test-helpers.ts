import * as fs from "fs";
import * as path from "path";
import { config } from "dotenv";
import { deserialize, serialize, toHex, type StampBook } from "book-of-stamps";

config({ path: path.resolve(__dirname, "../.env.test") });

const BOOK_DIR = path.resolve(__dirname, "../..");

function findBook(): string {
  const files = fs.readdirSync(BOOK_DIR).filter(f => f.startsWith("book-of-stamps-") && f.endsWith(".txt"));
  if (files.length === 0) throw new Error("no book of stamps found in " + BOOK_DIR);
  if (files.length > 1) throw new Error("multiple books found — expected exactly one: " + files.join(", "));
  return path.join(BOOK_DIR, files[0]);
}

const bookPath = findBook();
export const book: StampBook = deserialize(fs.readFileSync(bookPath, "utf-8"));
export const signerKey: string = toHex(book.privateKey);
export const apiURL: string = process.env.BEE_API_URL || "http://localhost:1633";

export function saveBook(): void {
  fs.writeFileSync(bookPath, serialize(book));
}

export function captureStampState(swarm: any): void {
  const state = swarm.getStampState?.();
  if (state) book.buckets = state;
}
