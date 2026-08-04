import { createApiClient } from "@repo/api-client";
import { supabase } from "./supabase";

const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export const api = createApiClient({ baseUrl });

// Attach the current Supabase access token to every request so the API's
// admin-gated write routes accept it.
api.use({
  async onRequest({ request }) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) request.headers.set("authorization", `Bearer ${token}`);
    return request;
  },
});
