import "server-only";
import bcrypt from "bcryptjs";
import { userRepository } from "@/lib/repositories/user-repository";

const BCRYPT_ROUNDS = 12;
// Compared against when the email is unknown, so login takes similar time
// whether or not the account exists.
const DUMMY_HASH = bcrypt.hashSync("dummy-password", BCRYPT_ROUNDS);

/** Creates an account. Returns the new user's id, or null if the email is already registered. */
export async function registerUser(input: { name: string; email: string; password: string }) {
  if (await userRepository.emailExists(input.email)) return null;

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await userRepository.create({ name: input.name, email: input.email, passwordHash });
  return user.id;
}

/** Returns the user's id if the email and password match, otherwise null. */
export async function verifyCredentials(email: string, password: string) {
  const user = await userRepository.findCredentialsByEmail(email);
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  return user && valid ? user.id : null;
}
