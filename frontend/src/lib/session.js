// Session boundary: auth is an httpOnly cookie the backend owns; the frontend's one
// duty is wiping the react-query cache so one account's data never renders for the next.
import { queryClient } from "./queryClient";
import { apiPost } from "./api";

// Call after every successful login.
export function beginSession() {
  queryClient.clear();
}

// Call from every sign-out control.
export async function endSession() {
  try {
    await apiPost("/auth/logout");
  } catch {
    // server session may already be gone; still wipe the client cache
  }
  queryClient.clear();
}
