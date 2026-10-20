import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { hashPassword } from "../apps/api/src/auth.ts";

const readline = createInterface({ input, output });
try {
  const password = await readline.question("Password (min 12 characters): ", { hideEchoBack: true });
  const confirmation = await readline.question("Repeat password: ", { hideEchoBack: true });
  if (password !== confirmation) throw new Error("Passwords do not match");
  console.log(`AUTH_PASSWORD_HASH=${await hashPassword(password)}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Could not create password hash");
  process.exitCode = 1;
} finally {
  readline.close();
}
